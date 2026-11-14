import { systemClock } from "../primitives/clock.js";
import type { Metadata } from "../primitives/metadata.js";
import { writeOnce } from "../primitives/once-per-sink.js";
import { KEEPALIVE_MAX_BYTES } from "./batch.js";
import { ExportScheduler } from "./export-scheduler.js";
import { isOtlpPayload, type OtlpPayload, payloadKind } from "./payloads.js";
import { type QueuedItem, withBytes } from "./queue-items.js";
import { StoredQueue } from "./queue-storage.js";
import { DEFAULT_OTLP_PROTOCOL, type OtlpQueue, type QueueConf, type ResolvedQueueConf } from "./queue-types.js";
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
	private readonly stored: StoredQueue;

	private readonly buffer = new ItemBuffer();
	private dropped = 0;
	// Out of the buffer, but kept in storage until its send settles.
	private batchBeingSent: QueuedItem[] = [];
	// A failed batch whose retry its report promised, so the trim spares it. Only `round` sets it.
	private retrying: ReadonlySet<QueuedItem> = new Set();

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

		const report = (msg: string, metadata: Metadata) => this.report(msg, metadata);

		this.sender = new OtlpSender(this.conf, report, msg => this.warnOnceToSink(msg));
		// A batch being sent is out of the buffer, but stays in storage until its send settles.
		this.stored = new StoredQueue(this.conf, report, () => [...this.batchBeingSent, ...this.buffer.items], payloads => this.restore(payloads));
		// Leftovers load before the first round.
		this.scheduler = new ExportScheduler(this.conf, this.stored.loaded, () => this.round());
	}

	enqueue(payload: OtlpPayload): void {
		if (!isOtlpPayload(payload)) {
			this.report("OTLP payload of unknown kind, dropped", {});

			return;
		}

		this.buffer.append(withBytes(payload));
		this.trim();
		this.stored.save();

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
				this.stored.save();

				const retryInMs = this.scheduler.backoff();

				this.report("OTLP export failed, will retry", { ...this.sender.describe(batch, failure), retryInMs });
				break;
			}

			this.scheduler.resetBackoff();
			this.stored.save();

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

	private restore(payloads: OtlpPayload[]): void {
		this.prepend(payloads.map(withBytes));

		if (this.buffer.items.length) {
			this.scheduler.schedule();
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
}
