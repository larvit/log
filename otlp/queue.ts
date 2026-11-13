import { systemClock } from "../primitives/clock.js";
import { stringField } from "../primitives/failure-fields.js";
import { type Metadata, withoutUndefined } from "../primitives/metadata.js";
import { writeOnce } from "../primitives/once-per-sink.js";
import { ExportScheduler } from "./export-scheduler.js";
import { type OtlpPayload, payloadKind } from "./payloads.js";
import { DEFAULT_OTLP_PROTOCOL, isOtlpPayload, KEEPALIVE_MAX_BYTES, type OtlpQueue, parseStoredPayloads, type QueueConf, type QueuedItem, type QueueStorage, type ResolvedQueueConf, withBytes } from "./queue-items.js";
import { OtlpSender } from "./sender.js";

function sumBytes(items: readonly QueuedItem[]): number {
	let sum = 0;

	for (const item of items) {
		sum += item.bytes;
	}

	return sum;
}

// The queued items and their byte total. Only these methods change either, so the total, which the
// size-triggered flush trusts, cannot drift from the items.
class ItemBuffer {
	private list: QueuedItem[] = [];
	private total = 0;

	get bytes(): number {
		return this.total;
	}

	get items(): readonly QueuedItem[] {
		return this.list;
	}

	append(item: QueuedItem): void {
		this.list.push(item);
		this.total += item.bytes;
	}

	// Not unshift(...items): a long stored list would overflow the call stack.
	prepend(items: QueuedItem[]): void {
		this.list = [...items, ...this.list];
		this.total += sumBytes(items);
	}

	remove(gone: ReadonlySet<QueuedItem>): void {
		this.list = this.list.filter(item => {
			if (gone.has(item)) {
				this.total -= item.bytes;
			}

			return !gone.has(item);
		});
	}
}

export class Queue implements OtlpQueue {
	readonly conf: ResolvedQueueConf;

	private readonly scheduler: ExportScheduler;
	private readonly sender: OtlpSender;

	private readonly buffer = new ItemBuffer();
	private dropped = 0;
	// Out of the buffer, but kept in storage until its send settles.
	private batchBeingSent: QueuedItem[] = [];
	// A failed batch whose retry its report promised, so the trim spares it. Only `round` sets it.
	private retrying: ReadonlySet<QueuedItem> = new Set();

	// Storage only: leftovers load before the first round, and saves coalesce into one writer.
	private dirty = false;
	private readonly ready: Promise<void>;
	private saving?: Promise<void>;
	// A getItem that threw: what storage holds stays untouched, since a later read may return it.
	private unreadable = false;

	/**
	 * @param warn Not part of the API: a `Log` passes the queue it builds the function that writes its
	 * warnings through its own `stderr`, at warn. Set `report` instead.
	 */
	constructor(conf: QueueConf, private readonly warn?: (msg: string) => void) {
		this.conf = {
			...conf,
			acceptPlainHttpCredentials: conf.acceptPlainHttpCredentials === true,
			batchDelayMs: conf.batchDelayMs ?? 1000,
			clock: conf.clock ?? systemClock,
			key: conf.key ?? "@larvit/log:otlp-queue",
			maxBatchBytes: conf.maxBatchBytes ?? KEEPALIVE_MAX_BYTES,
			maxItems: conf.maxItems ?? 1000,
			otlpProtocol: conf.otlpProtocol ?? DEFAULT_OTLP_PROTOCOL,
			report: conf.report ?? console.error,
			retryDelayMs: conf.retryDelayMs ?? 1000,
		};

		// A browser's localStorage holds the origin's session tokens, so no stringify or spread may carry it.
		Object.defineProperty(this.conf, "storage", { configurable: true, enumerable: false, value: conf.storage, writable: true });

		// Validate eagerly: a malformed endpoint or clock fails here, not as an unhandled rejection mid-log.
		const { clock } = this.conf;

		if (typeof clock.clearTimeout !== "function" || typeof clock.now !== "function" || typeof clock.setTimeout !== "function") {
			throw new Error("clock must be { now, setTimeout, clearTimeout }");
		}

		this.sender = new OtlpSender(this.conf, (msg, metadata) => this.report(msg, metadata), msg => this.warnOnceToSink(msg));

		this.ready = conf.storage ? this.load(conf.storage) : Promise.resolve();
		this.scheduler = new ExportScheduler(this.conf, this.ready, () => this.round());
	}

	enqueue(payload: OtlpPayload): void {
		if (!isOtlpPayload(payload)) {
			this.report("OTLP payload of unknown kind, dropped", {});

			return;
		}

		this.buffer.append(withBytes(payload));
		this.trim();
		this.scheduleSave();

		if (this.buffer.bytes >= this.conf.maxBatchBytes) {
			void this.flush();
		} else {
			this.scheduler.schedule();
		}
	}

	flush(): Promise<void> {
		return this.scheduler.flush();
	}

	// A pending timer is a circular Timeout on Node, so stringifying working state would throw.
	toJSON(): object {
		return this.conf;
	}

	private async round(): Promise<void> {
		while (this.buffer.items.length) {
			const batch = this.takeBatch();

			this.batchBeingSent = batch;

			const failure = await this.sender.send(batch);

			this.batchBeingSent = [];
			this.retrying = new Set(failure?.retry ? batch : []);

			if (failure?.retry) {
				this.prepend(batch);
				this.scheduleSave();

				const retryInMs = this.scheduler.backoff();

				this.report("OTLP export failed, will retry", { ...this.sender.describe(batch, failure), retryInMs });
				break;
			}

			this.scheduler.resetBackoff();
			this.scheduleSave();

			if (failure) {
				this.report(failure.reportAs ?? "OTLP export rejected, batch dropped", this.sender.describe(batch, failure));
			}
		}

		this.reportDrops();
	}

	// The oldest item's kind, plus every later item of the same, up to maxBatchBytes.
	private takeBatch(): QueuedItem[] {
		const kind = payloadKind(this.buffer.items[0].payload);
		const batch: QueuedItem[] = [];
		let bytes = 0;

		for (const item of this.buffer.items) {
			if (payloadKind(item.payload) !== kind) {
				continue;
			}

			if (batch.length && bytes + item.bytes > this.conf.maxBatchBytes) {
				break;
			}

			batch.push(item);
			bytes += item.bytes;
		}

		this.buffer.remove(new Set(batch));

		return batch;
	}

	private warnOnceToSink(msg: string): void {
		const { report } = this.conf;

		try {
			// Once per message for each warning sink: the `warn` a Log passed, else `report`.
			writeOnce(this.warn ?? report, msg, () => this.warn ? this.warn(msg) : report(msg, {}));
		} catch {
			// A sink that throws must not break the export loop.
		}
	}

	private report(msg: string, metadata: Metadata): void {
		try {
			this.conf.report(msg, metadata);
		} catch {
			// A sink that throws must not break the export loop.
		}
	}

	private reportDrops(): void {
		if (this.dropped) {
			this.report("OTLP queue full, oldest items dropped", { dropped: this.dropped });
			this.dropped = 0;
		}
	}

	// A failed or persisted batch is older than anything queued since, so it goes in front.
	private prepend(items: QueuedItem[]): void {
		this.buffer.prepend(items);
		this.trim();
	}

	// Drops the oldest over maxItems, sparing the batch being retried. That batch holds at most
	// maxItems, so enough other items remain to drop.
	private trim(): void {
		const excess = this.buffer.items.length - this.conf.maxItems;

		if (excess > 0) {
			this.buffer.remove(new Set(this.buffer.items.filter(item => !this.retrying.has(item)).slice(0, excess)));
			this.dropped += excess;
		}
	}

	private async load(storage: QueueStorage): Promise<void> {
		let raw: string | null | undefined;

		try {
			raw = await storage.getItem(this.conf.key);
		} catch (err) {
			this.unreadable = true;
			this.report("OTLP queue storage unreadable, stored queue kept and not written to", withoutUndefined({ error: stringField(err, "message"), key: this.conf.key }));

			return;
		}

		if (!raw) {
			return;
		}

		const stored = parseStoredPayloads(raw);

		if ("payloads" in stored) {
			this.prepend(stored.payloads.map(withBytes));

			if (this.buffer.items.length) {
				this.scheduler.schedule();
			}

			return;
		}

		this.report("OTLP queue storage unreadable, discarded", withoutUndefined({ error: stored.error, key: this.conf.key }));

		try {
			await storage.removeItem(this.conf.key);
		} catch {
			// The next save overwrites it.
		}
	}

	private scheduleSave(): void {
		if (!this.conf.storage) {
			return;
		}

		this.dirty = true;
		this.saving ??= this.save(this.conf.storage);
	}

	private async save(storage: QueueStorage): Promise<void> {
		await this.ready;

		while (this.dirty && !this.unreadable) {
			this.dirty = false;

			try {
				const persisted = [...this.batchBeingSent, ...this.buffer.items];

				if (persisted.length) {
					await storage.setItem(this.conf.key, JSON.stringify(persisted.map(item => item.payload)));
				} else {
					await storage.removeItem(this.conf.key);
				}
			} catch (err) {
				this.report("OTLP queue storage write failed", withoutUndefined({ error: stringField(err, "message"), key: this.conf.key }));
			}
		}

		this.saving = undefined;
	}
}
