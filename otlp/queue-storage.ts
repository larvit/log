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

// A queue's copy in `conf.storage`: read once, when the queue starts, and rewritten after each change
// by one writer at a time. A queue without storage is never read or written.
export class StoredQueue {
	private dirty = false;
	// The one read, restore included, which every write waits for.
	private loaded: Promise<void> = Promise.resolve();
	private saving?: Promise<void>;
	// A getItem that threw: what storage holds stays untouched, since a later read may return it.
	private unreadable = false;

	// `items` is what a write persists. It is read as the write starts, so one write covers every
	// change made before it.
	constructor(
		private readonly conf: ResolvedQueueConf,
		private readonly report: (msg: string, metadata: Metadata) => void,
		private readonly items: () => readonly QueuedItem[],
	) {}

	// Hands `restore` the payloads storage holds, if it holds any that can be read. The promise settles
	// once storage is read and restored, and never rejects.
	load(restore: (payloads: OtlpPayload[]) => void): Promise<void> {
		const { storage } = this.conf;

		this.loaded = storage ? this.read(storage, restore) : Promise.resolve();

		return this.loaded;
	}

	// Saves coalesce: a change made while a write runs is covered by one more write after it.
	save(): void {
		if (!this.conf.storage) {
			return;
		}

		this.dirty = true;
		this.saving ??= this.write(this.conf.storage);
	}

	private async read(storage: QueueStorage, restore: (payloads: OtlpPayload[]) => void): Promise<void> {
		const { key } = this.conf;
		let raw: string | null | undefined;

		try {
			raw = await storage.getItem(key);
		} catch (err) {
			this.unreadable = true;
			this.report("OTLP queue storage unreadable, stored queue kept and not written to", withoutUndefined({ error: stringField(err, "message"), key }));

			return;
		}

		if (!raw) {
			return;
		}

		const stored = parseStoredPayloads(raw);

		if ("payloads" in stored) {
			restore(stored.payloads);

			return;
		}

		this.report("OTLP queue storage unreadable, discarded", withoutUndefined({ error: stored.error, key }));

		try {
			await storage.removeItem(key);
		} catch {
			// The next save overwrites it.
		}
	}

	private async write(storage: QueueStorage): Promise<void> {
		const { key } = this.conf;

		await this.loaded;

		while (this.dirty && !this.unreadable) {
			this.dirty = false;

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
		}

		this.saving = undefined;
	}
}
