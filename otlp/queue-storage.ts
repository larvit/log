import { stringField } from "../primitives/failure-fields.js";
import { type Metadata, withoutUndefined } from "../primitives/metadata.js";
import { isOtlpPayload, type OtlpPayload } from "./payloads.js";
import type { QueuedItem } from "./queue-items.js";
import type { QueueStorage, ResolvedQueueConf } from "./queue-types.js";

// What a queue's storage holds: the payloads it saved, or why they can't be read.
function parseStoredPayloads(raw: string): { error: string | undefined } | { payloads: OtlpPayload[] } {
	let parsed: unknown;

	try {
		parsed = JSON.parse(raw);
	} catch (err) {
		return { error: stringField(err, "message") };
	}

	if (!Array.isArray(parsed) || !parsed.every(isOtlpPayload)) {
		return { error: "not a list of OTLP payloads" };
	}

	return { payloads: parsed };
}

// `writing`: one write runs. `rewriteDue`: a change came after that write read the items, so one more
// write follows it. `unreadable`: a getItem threw, and what storage holds stays untouched, since a
// later read may return it.
type SaveState = "idle" | "rewriteDue" | "unreadable" | "writing";

// A queue's copy in `conf.storage`: read once, when the queue starts, and rewritten after each change
// by one writer at a time.
export class StoredQueue {
	// The one read, restore included, which every write waits for. It never rejects.
	readonly loaded: Promise<void>;
	// Whether the read could reach storage.
	private readonly readable: Promise<boolean>;
	private state: SaveState = "idle";

	// `items` is what a write persists. It is read as the write starts, so one write covers every
	// change made before it. `restore` is handed the payloads storage holds, if it holds any that can
	// be read. Storage is read asynchronously, so `restore` runs only after this constructor returns.
	constructor(
		private readonly conf: ResolvedQueueConf,
		private readonly report: (msg: string, metadata: Metadata) => void,
		private readonly items: () => readonly QueuedItem[],
		restore: (payloads: OtlpPayload[]) => void,
	) {
		this.readable = conf.storage ? this.read(conf.storage, restore) : Promise.resolve(true);
		this.loaded = this.readable.then(() => undefined);
	}

	// Saves coalesce: a change made while a write runs is covered by one more write after it.
	save(): void {
		if (!this.conf.storage) {
			return;
		}

		if (this.state === "idle") {
			this.state = "writing";
			void this.write(this.conf.storage);
		} else if (this.state === "writing") {
			this.state = "rewriteDue";
		}
	}

	private async read(storage: QueueStorage, restore: (payloads: OtlpPayload[]) => void): Promise<boolean> {
		const { key } = this.conf;
		let raw: string | null | undefined;

		try {
			raw = await storage.getItem(key);
		} catch (err) {
			this.report("OTLP queue storage unreadable, stored queue kept and not written to", withoutUndefined({ error: stringField(err, "message"), key }));

			return false;
		}

		if (!raw) {
			return true;
		}

		const stored = parseStoredPayloads(raw);

		if ("payloads" in stored) {
			restore(stored.payloads);

			return true;
		}

		this.report("OTLP queue storage unreadable, discarded", withoutUndefined({ error: stored.error, key }));

		try {
			await storage.removeItem(key);
		} catch {
			// The next save overwrites it.
		}

		return true;
	}

	private async write(storage: QueueStorage): Promise<void> {
		const { key } = this.conf;

		if (!await this.readable) {
			this.state = "unreadable";

			return;
		}

		do {
			this.state = "writing";

			try {
				const persisted = this.items();

				if (persisted.length) {
					await storage.setItem(key, JSON.stringify(persisted.map(item => item.payload)));
				} else {
					await storage.removeItem(key);
				}
			} catch (err) {
				this.report("OTLP queue storage write failed", withoutUndefined({ error: stringField(err, "message"), key }));
			}
			// save() may have set it during the await, which TypeScript's narrowing doesn't see.
		} while ((this.state as SaveState) === "rewriteDue");

		this.state = "idle";
	}
}
