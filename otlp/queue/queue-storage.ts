import { stringField } from "../../primitives/failure-fields.js";
import { type Metadata, withoutUndefined } from "../../primitives/metadata.js";
import { isOtlpPayload, type OtlpPayload } from "../payloads.js";
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

// `writing`: one write runs. `rewriteDue`: one more write follows this one. `unreadable`: a getItem threw, and what storage holds stays untouched, since a
// later read may return it.
type SaveState = "idle" | "rewriteDue" | "unreadable" | "writing";

// `save`: the queue changed. `unreadable`: a write found that the read failed. `writeStarted`: a write
// reads the items, so it covers every save made before. `writeDone`: a write ended, stored or failed.
type SaveEvent = "save" | "unreadable" | "writeDone" | "writeStarted";

// The whole save machine. `startWrite`: a write starts next, from save() or as one more pass of the running write.
export function saveTransition(state: SaveState, event: SaveEvent): { startWrite: boolean, state: SaveState } {
	switch (event) {
		case "save":
			if (state === "idle") {
				return { startWrite: true, state: "writing" };
			}

			return { startWrite: false, state: state === "writing" ? "rewriteDue" : state };
		case "unreadable":
			return { startWrite: false, state: "unreadable" };
		case "writeStarted":
			return { startWrite: false, state: "writing" };
		case "writeDone":
			return state === "rewriteDue" ? { startWrite: true, state: "writing" } : { startWrite: false, state: "idle" };
	}
}

// A queue's copy in `conf.storage`: read once, when the queue starts, and rewritten after each change
// by one writer at a time.
export class StoredQueue {
	// The one read, restore included.
	readonly loaded: Promise<void>;
	// The same read: whether it reached storage. Every write waits for it.
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
		// Without storage nothing writes, so nothing reads the `true` and no test can tell it from `false`.
		this.readable = conf.storage ? this.read(conf.storage, restore) : Promise.resolve(true);
		this.loaded = this.readable.then(() => undefined);
	}

	// Saves coalesce: a change made while a write runs is covered by one more write after it.
	save(): void {
		if (!this.conf.storage) {
			return;
		}

		if (this.dispatch("save")) {
			void this.write(this.conf.storage);
		}
	}

	// `saveTransition` decides; this returns whether a write starts next.
	private dispatch(event: SaveEvent): boolean {
		const { startWrite, state } = saveTransition(this.state, event);

		this.state = state;

		return startWrite;
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
			this.dispatch("unreadable");

			return;
		}

		do {
			this.dispatch("writeStarted");

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
		} while (this.dispatch("writeDone"));
	}
}
