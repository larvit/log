import { Queue } from "../otlp/queue.js";
import { DEFAULT_OTLP_PROTOCOL, type OtlpQueue } from "../otlp/queue-types.js";
import type { Metadata } from "../primitives/metadata.js";
import { warnOnceToStderr, writeStderr } from "./stderr-warnings.js";
import type { LogConf, ResolvedLogConf } from "./types.js";

// The default queue: the Queue a Log builds from its otlp* shorthand. attachDefaultQueue builds it into
// conf.otlpQueue, beside that shorthand, so a child, a clone or a spread of the conf carries the pair.

const OTLP_ENDPOINT_KEYS = ["otlpAdditionalHeaders", "otlpHttpBaseURI", "otlpProtocol"] as const;

type OtlpShorthand = Pick<LogConf, typeof OTLP_ENDPOINT_KEYS[number]>;
type OtlpSettings = OtlpShorthand & Pick<LogConf, "otlpQueue">;

function sameOrigin(uri: string, other: string): boolean {
	try {
		return new URL(uri).origin === new URL(other).origin;
	} catch {
		return false;
	}
}

// A queue stays only beside the endpoint it was built from; headers only beside their endpoint's origin.
export function otlpKeysNotToInherit(conf: OtlpSettings, sourceConf: LogConf): (keyof LogConf)[] {
	if (conf.otlpQueue) {
		return [...OTLP_ENDPOINT_KEYS];
	}

	if (!OTLP_ENDPOINT_KEYS.some(key => conf[key] !== undefined)) {
		return [];
	}

	if (conf.otlpHttpBaseURI === undefined || sourceConf.otlpHttpBaseURI === undefined || sameOrigin(conf.otlpHttpBaseURI, sourceConf.otlpHttpBaseURI)) {
		return ["otlpQueue"];
	}

	return ["otlpAdditionalHeaders", "otlpQueue"];
}

// Each default queue, with the shorthand it was built from. Only such a queue passes the rejection
// below, and only beside that shorthand: the strings equal, and the headers the same object, since an
// equal copy is one a rotation could make differ.
const defaultQueueShorthand = new WeakMap<OtlpQueue, OtlpShorthand>();

function isDefaultQueueFor(queue: OtlpQueue, conf: OtlpShorthand): boolean {
	const builtFrom = defaultQueueShorthand.get(queue);

	return builtFrom !== undefined
		&& builtFrom.otlpHttpBaseURI === conf.otlpHttpBaseURI
		&& (builtFrom.otlpProtocol ?? DEFAULT_OTLP_PROTOCOL) === (conf.otlpProtocol ?? DEFAULT_OTLP_PROTOCOL)
		&& builtFrom.otlpAdditionalHeaders === conf.otlpAdditionalHeaders;
}

// The one write to a conf after its defaults are set. The queue warns through the conf, and can warn
// while the queue is being built, so the conf has to exist first.
export function attachDefaultQueue(conf: ResolvedLogConf): void {
	if (!conf.otlpQueue && conf.otlpHttpBaseURI) {
		const { otlpAdditionalHeaders, otlpHttpBaseURI, otlpProtocol } = conf;
		const report = (msg: string, metadata: Metadata) => writeStderr(conf, "error", metadata, msg);

		conf.otlpQueue = new Queue({ clock: conf.clock, otlpAdditionalHeaders, otlpHttpBaseURI, otlpProtocol, report }, msg => warnOnceToStderr(conf, undefined, msg));
		defaultQueueShorthand.set(conf.otlpQueue, { otlpAdditionalHeaders, otlpHttpBaseURI, otlpProtocol });
	}
}

export function rejectQueueBesideShorthand(conf: OtlpSettings): void {
	if (conf.otlpQueue && OTLP_ENDPOINT_KEYS.some(key => conf[key] !== undefined) && !isDefaultQueueFor(conf.otlpQueue, conf)) {
		throw new Error("otlpQueue carries the endpoint: set otlpHttpBaseURI, otlpProtocol and otlpAdditionalHeaders on the queue, not beside it");
	}
}
