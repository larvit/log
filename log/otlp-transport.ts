import { buildLogPayload, buildSpanPayload } from "../otlp/payloads.js";
import { Queue } from "../otlp/queue/queue.js";
import type { QueueConf } from "../otlp/queue/queue-types.js";
import type { Transport } from "../tracing/transport.js";

export type OtlpTransportOptions = Omit<QueueConf, "otlpAdditionalHeaders" | "otlpHttpBaseURI" | "otlpProtocol"> & {
	// Entries are POSTed to /v1/logs under it, and spans to /v1/traces.
	baseUrl: string;
	headers?: Record<string, string>;
	protocol?: QueueConf["otlpProtocol"];
};

// Encodes each entry and span as an OTLP payload, and exports it through a Queue of its own.
export function otlpTransport(options: OtlpTransportOptions): Transport {
	const { baseUrl, headers, protocol, ...queueOptions } = options;
	const queue = new Queue({
		...queueOptions,
		otlpHttpBaseURI: baseUrl,
		...headers === undefined ? {} : { otlpAdditionalHeaders: headers },
		...protocol === undefined ? {} : { otlpProtocol: protocol },
	});

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
