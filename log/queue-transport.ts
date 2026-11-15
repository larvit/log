import { buildLogPayload, buildSpanPayload } from "../otlp/payloads.js";
import type { OtlpQueue } from "../otlp/queue/queue-types.js";
import type { Transport } from "./transport.js";

// Hands a queue each entry and span as an OTLP payload: the one place a record becomes a payload,
// for otlpTransport's queue and for the deprecated `otlpQueue` alike.
export function queueTransport(queue: OtlpQueue): Transport {
	return {
		entry({ logLevel, metadata, msg, msTimestamp, spanId, traceId }) {
			queue.enqueue(buildLogPayload({ attributes: metadata, logLevel, msTimestamp, msg, span: { spanId, traceId } }));
		},
		flush: () => queue.flush(),
		span(span) {
			queue.enqueue(buildSpanPayload(span));
		},
	};
}
