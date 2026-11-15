import { attachDefaultQueue, OTLP_ENDPOINT_KEYS, rejectQueueBesideShorthand } from "./deprecated-options/default-queue.js";
import { attachFormatter, formatterWarning, functionFormatterOf, ownFunctionFormatter } from "./deprecated-options/formatter-alias.js";
import { DEFAULT_LOG_LEVEL, type LogLevel } from "../primitives/levels.js";
import { defaultColors } from "./entry-format.js";
import type { LogConf, LogOptions, ResolvedLogConf } from "./types.js";
import { type Metadata, withoutUndefined } from "../primitives/metadata.js";
import { platformRandomBytes } from "../tracing/traceparent.js";
import { rejectBesideTransports, REPLACED_BY_TRANSPORTS } from "./deprecated-options/replaced-by-transports.js";
import { systemClock } from "../primitives/clock.js";


type Derivation = "child" | "clone";

type Source = { conf: LogConf, context?: Metadata };

const CHILD_AND_CLONE: readonly Derivation[] = ["child", "clone"];

// Which derivations take a key from their source when the caller leaves it unset.
const INHERITED_BY: { [K in keyof LogConf]-?: readonly Derivation[] } = {
	captureQuery: CHILD_AND_CLONE,
	captureRequestHeaders: CHILD_AND_CLONE,
	captureResponseHeaders: CHILD_AND_CLONE,
	clock: CHILD_AND_CLONE,
	colors: CHILD_AND_CLONE,
	// A clone merges its source's live `context` per key instead.
	context: ["child"],
	entryFormatter: CHILD_AND_CLONE,
	format: CHILD_AND_CLONE,
	logLevel: CHILD_AND_CLONE,
	otlpAdditionalHeaders: CHILD_AND_CLONE,
	otlpHttpBaseURI: CHILD_AND_CLONE,
	otlpProtocol: CHILD_AND_CLONE,
	otlpQueue: CHILD_AND_CLONE,
	parentLog: [],
	printTraceInfo: CHILD_AND_CLONE,
	randomBytes: CHILD_AND_CLONE,
	// A clone is its own span.
	spanName: ["child"],
	stderr: CHILD_AND_CLONE,
	stdout: CHILD_AND_CLONE,
	traceparent: [],
	transports: CHILD_AND_CLONE,
};

// What a conf, the caller's or a clone's, keeps a source from handing down, so the two never mix:
// a list keeps out every option it replaces, and such an option keeps out the list.
function keysTransportsKeepOut(conf: LogConf): (keyof LogConf)[] {
	const replaced = REPLACED_BY_TRANSPORTS.map(([key]) => key);

	if (conf.transports) {
		return replaced;
	}

	return replaced.some(key => conf[key] !== undefined) ? ["transports"] : [];
}

function isLogConfKey(key: string): key is keyof LogConf {
	return Object.prototype.hasOwnProperty.call(INHERITED_BY, key);
}

const LOG_CONF_KEYS = Object.keys(INHERITED_BY).filter(isLogConfKey);


// The caller's options as a conf. A Log's own conf passed as options hands on its function formatter
// only unspread: a spread drops the non-enumerable entryFormatter accessor.
function ownConf(options: LogOptions | LogLevel | "none" | undefined): { conf: LogConf, warning?: string } {
	const copy: LogOptions = typeof options === "string" ? { logLevel: options } : { ...options };
	const { context, entryFormatter, format, ...rest } = copy;
	// Options from untyped code may be null, which counts as no options.
	const fromLogConf = typeof options === "object" && options !== null ? ownFunctionFormatter(options) : undefined;
	const formatFunction = typeof format === "function" ? format : fromLogConf;

	if (entryFormatter !== undefined && formatFunction !== undefined && formatFunction !== entryFormatter) {
		throw new Error("entryFormatter and format are two spellings of one formatter: pass it once, to consoleTransport({ format })");
	}

	const formatter = formatFunction ?? entryFormatter;

	const conf: LogConf = {
		...rest,
		...context === undefined ? {} : { context: withoutUndefined(context) },
		// Only undefined is unset, as in orDefault: a null from untyped code still replaces the
		// source's formatter.
		...format === undefined || typeof format === "function" ? {} : { format },
		// Left out when unset, though an undefined would not last: withDefaults splits entryFormatter off before the conf is built.
		...formatter === undefined ? {} : { entryFormatter: formatter },
	};

	return { conf, warning: formatterWarning(copy) };
}

function sameOrigin(uri: string, other: string): boolean {
	try {
		return new URL(uri).origin === new URL(other).origin;
	} catch {
		return false;
	}
}

// A queue stays only beside the endpoint it was built from; headers only beside their endpoint's origin.
function otlpKeysNotToInherit(conf: LogConf, sourceConf: LogConf): (keyof LogConf)[] {
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

// Generic over the key, so the compiler sees one value type on both sides.
function copyKey<K extends keyof LogConf>(target: LogConf, source: LogConf, key: K): void {
	target[key] = source[key];
}

function inherited(conf: LogConf, source: Source, derivation: Derivation): LogConf {
	const skip = new Set([...otlpKeysNotToInherit(conf, source.conf), ...keysTransportsKeepOut(conf)]);

	// The caller's formatter, in either key, replaces the source's in both.
	if (conf.format !== undefined || conf.entryFormatter !== undefined) {
		skip.add("format");
		skip.add("entryFormatter");
	}

	const taken: LogConf = {};

	for (const key of LOG_CONF_KEYS) {
		// Read each key off source.conf, not a spread of it: a hand-written LogInt's conf may hold a key
		// behind a getter, which a spread drops. entryFormatter goes through functionFormatterOf, which
		// leaves out the built-in formatter a conf built here reads back.
		const from = key === "entryFormatter" ? { entryFormatter: functionFormatterOf(source.conf) } : source.conf;

		if (INHERITED_BY[key].includes(derivation) && !skip.has(key) && conf[key] === undefined && from[key] !== undefined) {
			copyKey(taken, from, key);
		}
	}

	return {
		...conf,
		...taken,
		// The source's `context` is live, so a caller may have written an undefined into it.
		...derivation === "clone" ? { context: withoutUndefined({ ...source.context, ...conf.context }) } : {},
	};
}

// Only undefined is unset: a null is kept, so the check for a bad value still sees it.
function orDefault<T>(value: T | undefined, fallback: T): T {
	return value === undefined ? fallback : value;
}


function withDefaults(given: LogConf): ResolvedLogConf {
	const { entryFormatter, ...rest } = given;
	const conf = {
		...rest,
		clock: orDefault(rest.clock, systemClock),
		colors: orDefault(rest.colors, defaultColors()),
		logLevel: orDefault(rest.logLevel, DEFAULT_LOG_LEVEL),
		randomBytes: orDefault(rest.randomBytes, platformRandomBytes),
		stderr: orDefault(rest.stderr, console.error),
		stdout: orDefault(rest.stdout, console.log),
		...rest.format === undefined && !entryFormatter && !rest.transports ? { format: "text" as const } : {},
	};

	// ResolvedLogConf requires these two until 3.0.0, though beside a list neither has an effect.
	// Not enumerable, so `new Log({ ...log.conf })` does not hand them back as options, which would throw.
	if (rest.transports) {
		Object.defineProperty(conf, "colors", { enumerable: false });
		Object.defineProperty(conf, "stdout", { enumerable: false });
	}

	attachFormatter(conf, entryFormatter);

	return conf;
}

// A clone passes the Log it clones as cloneOf.
export function resolveConf(options: LogOptions | LogLevel | "none" | undefined, cloneOf?: Source): { conf: ResolvedLogConf, warnings: string[] } {
	const { conf: own, warning } = ownConf(options);

	rejectBesideTransports(own, [cloneOf?.conf, typeof own.parentLog === "object" ? own.parentLog.conf : undefined]);
	const cloned = cloneOf ? inherited(own, cloneOf, "clone") : own;
	const derived = typeof cloned.parentLog === "object" ? inherited(cloned, cloned.parentLog, "child") : cloned;

	rejectQueueBesideShorthand(derived);

	const conf = withDefaults(derived);

	attachDefaultQueue(conf);

	return { conf, warnings: warning ? [warning] : [] };
}
