import { DEFAULT_OTLP_PROTOCOL, type OtlpQueue } from "../otlp/queue/queue-types.js";
import type { LogConf, ResolvedLogConf } from "./types.js";
import type { Metadata } from "../primitives/metadata.js";
import { Queue } from "../otlp/queue/queue.js";
import { warnOnceToStderr, writeStderr } from "./stderr-lines.js";

// The default queue: the Queue a Log builds from its otlp* shorthand. attachDefaultQueue builds it into
// conf.otlpQueue, beside that shorthand, so a child, a clone or a spread of the conf carries the pair.

export const OTLP_ENDPOINT_KEYS = ["otlpAdditionalHeaders", "otlpHttpBaseURI", "otlpProtocol"] as const;

// The class of every queue a Log builds from its otlp* shorthand, and so the mark of one.
class DefaultQueue extends Queue {}

// A queue may sit beside the shorthand only where it is a DefaultQueue whose conf holds the endpoint
// that `conf` holds now. The headers must be the same object: a token rotated in place then reaches
// the queue, which an equal copy would miss.
function isDefaultQueueFor(queue: OtlpQueue, conf: LogConf): boolean {
	return queue instanceof DefaultQueue
		&& queue.conf.otlpHttpBaseURI === conf.otlpHttpBaseURI
		&& queue.conf.otlpProtocol === (conf.otlpProtocol ?? DEFAULT_OTLP_PROTOCOL)
		&& queue.conf.otlpAdditionalHeaders === conf.otlpAdditionalHeaders;
}

export function rejectQueueBesideShorthand(conf: LogConf): void {
	if (conf.otlpQueue && OTLP_ENDPOINT_KEYS.some(key => conf[key] !== undefined) && !isDefaultQueueFor(conf.otlpQueue, conf)) {
		throw new Error("otlpQueue carries the endpoint: set otlpHttpBaseURI, otlpProtocol and otlpAdditionalHeaders on the queue, not beside it");
	}
}

// The one write to a conf after its defaults are set. The queue warns through the conf, and can warn
// while the queue is being built, so the conf has to exist first.
export function attachDefaultQueue(conf: ResolvedLogConf): void {
	if (!conf.otlpQueue && conf.otlpHttpBaseURI) {
		const { otlpAdditionalHeaders, otlpHttpBaseURI, otlpProtocol } = conf;
		const report = (msg: string, metadata: Metadata) => writeStderr(conf, "error", metadata, msg);

		conf.otlpQueue = new DefaultQueue({ clock: conf.clock, otlpAdditionalHeaders, otlpHttpBaseURI, otlpProtocol, report }, msg => warnOnceToStderr(conf, undefined, msg));
	}
}
