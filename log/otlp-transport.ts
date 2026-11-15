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

// The Queue names its own options in what it throws and reports; the caller wrote the transport's.
function inTransportNames(msg: string): string {
	return msg.replace(/otlpHttpBaseURI/g, "baseUrl").replace(/otlpAdditionalHeaders/g, "headers").replace("on the Queue", "on otlpTransport");
}

function queueOf(options: OtlpTransportOptions): Queue {
	const { baseUrl, headers, protocol, report = console.error, ...queueOptions } = options;

	try {
		return new Queue({
			...queueOptions,
			otlpHttpBaseURI: baseUrl,
			report: (msg, metadata) => { report(inTransportNames(msg), metadata); },
			...headers === undefined ? {} : { otlpAdditionalHeaders: headers },
			...protocol === undefined ? {} : { otlpProtocol: protocol },
		});
	} catch (err) {
		throw err instanceof Error ? new Error(inTransportNames(err.message)) : err;
	}
}

// Exports each entry and span as an OTLP payload, through a Queue of its own.
export function otlpTransport(options: OtlpTransportOptions): Transport {
	const queue = queueOf(options);

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
