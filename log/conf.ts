import { systemClock } from "../primitives/clock.js";
import { DEFAULT_LOG_LEVEL, type LogLevel } from "../primitives/levels.js";
import { type Metadata, withoutUndefined } from "../primitives/metadata.js";
import { platformRandomBytes } from "../tracing/traceparent.js";
import { attachDefaultQueue, OTLP_ENDPOINT_KEYS, rejectQueueBesideShorthand } from "./default-queue.js";
import { colorsFromEnv, msgJsonFormatter, msgTextFormatter } from "./entry-format.js";
import type { EntryFormatter, LogConf, LogOptions, ResolvedLogConf } from "./types.js";

// How a Log's conf is made, all in resolveConf: the caller's options become a LogConf (ownConf). It
// takes each key the caller left unset from the Log it clones, then from its parentLog (inherited),
// then the defaults (withDefaults), then the default queue (attachDefaultQueue).
//
// A conf holds the formatter in two keys, as 2.x documents: `format`, "json" or "text", and
// `entryFormatter`, a function formatter, which wins. A function passed as `format` moves to
// entryFormatter. On a Log's own conf, entryFormatter is an accessor that reads the formatter in use
// and keeps the function in functionFormatters, so that conf.format still reads back a string.

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
};

function isLogConfKey(key: string): key is keyof LogConf {
	return Object.prototype.hasOwnProperty.call(INHERITED_BY, key);
}

const LOG_CONF_KEYS = Object.keys(INHERITED_BY).filter(isLogConfKey);

// The function formatter of each conf this copy of the library built with one.
const functionFormatters = new WeakMap<object, EntryFormatter>();

function builtInFormatter(format: LogConf["format"]): EntryFormatter {
	return format === "json" ? msgJsonFormatter : msgTextFormatter;
}

// The formatter a conf writes with: its entryFormatter, which wins, else the built-in its format names.
export function resolveFormatter(conf: LogConf): EntryFormatter {
	return conf.entryFormatter ?? builtInFormatter(conf.format);
}

// One descriptor for every instance: README → Footprint's 1 KB budget.
const ENTRY_FORMATTER_ALIAS: PropertyDescriptor = {
	configurable: true,
	// So a spread never hands the alias back as an option the caller wrote.
	enumerable: false,
	get(this: ResolvedLogConf): EntryFormatter {
		return functionFormatters.get(this) ?? builtInFormatter(this.format);
	},
	set(this: ResolvedLogConf, formatter: EntryFormatter) {
		functionFormatters.set(this, formatter);
	},
};

// A conf this copy of the library built: it carries the one shared entryFormatter accessor.
function builtHere(conf: LogConf): boolean {
	return Object.getOwnPropertyDescriptor(conf, "entryFormatter")?.get === ENTRY_FORMATTER_ALIAS.get;
}

// The function formatter a conf hands on. The entryFormatter of a conf built here reads a built-in
// formatter when it has no function, and a child or clone must not take that, so that it follows its
// own format.
function functionFormatterOf(conf: LogConf): EntryFormatter | undefined {
	return functionFormatters.get(conf) ?? (builtHere(conf) ? undefined : conf.entryFormatter);
}

function entryFormatterDeprecation(options: LogOptions): string | undefined {
	if (options.entryFormatter === undefined) {
		return undefined;
	}

	if (typeof options.format === "string") {
		return "@larvit/log: entryFormatter is deprecated and removed in 3.0.0, use format — entryFormatter wins and the format beside it is ignored";
	}

	return "@larvit/log: entryFormatter is deprecated and removed in 3.0.0, use format";
}

// The caller's options as a conf. A Log's own conf passed as options hands on its function formatter
// only unspread: a spread drops the non-enumerable entryFormatter accessor.
function ownConf(options: LogOptions | LogLevel | "none" | undefined): { conf: LogConf, deprecation?: string } {
	const copy: LogOptions = typeof options === "string" ? { logLevel: options } : { ...options };
	const { context, entryFormatter, format, ...rest } = copy;
	// Options from untyped code may be null, which counts as no options.
	const fromLogConf = typeof options === "object" && options !== null ? functionFormatters.get(options) : undefined;
	const formatFunction = typeof format === "function" ? format : fromLogConf;

	if (entryFormatter !== undefined && formatFunction !== undefined && formatFunction !== entryFormatter) {
		throw new Error("entryFormatter and format are two spellings of one formatter: pass only format");
	}

	const formatter = formatFunction ?? entryFormatter;

	const conf: LogConf = {
		...rest,
		...context === undefined ? {} : { context: withoutUndefined(context) },
		// Only undefined is unset, as in orDefault: a null from untyped code still replaces the source's formatter.
		...format === undefined || typeof format === "function" ? {} : { format },
		...formatter === undefined ? {} : { entryFormatter: formatter },
	};

	return { conf, deprecation: entryFormatterDeprecation(copy) };
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
	const skip = new Set(otlpKeysNotToInherit(conf, source.conf));

	// The caller's formatter, in either key, replaces the source's in both.
	if (conf.format !== undefined || conf.entryFormatter !== undefined) {
		skip.add("format");
		skip.add("entryFormatter");
	}

	const taken: LogConf = {};

	for (const key of LOG_CONF_KEYS) {
		// Read off the source itself, since a hand-written LogInt's conf may hold a key behind a getter.
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

// The process global's env, or undefined where there is none (browsers) or a permission-gated one throws.
function processEnv(): unknown {
	try {
		const processGlobal: unknown = Reflect.get(globalThis, "process");

		return typeof processGlobal === "object" && processGlobal !== null ? Reflect.get(processGlobal, "env") : undefined;
	} catch {
		return undefined;
	}
}

// Defined after the conf is built: writing entryFormatter into it first and redefining it turns a data
// property into an accessor, which drops every conf into V8's slow dictionary mode and past README →
// Footprint.
function attachFormatter<T extends object>(conf: T, formatter: EntryFormatter | undefined): asserts conf is T & Pick<ResolvedLogConf, "entryFormatter"> {
	// Only a function gets an entry, which costs each instance about 42 bytes against README → Footprint.
	if (formatter) {
		functionFormatters.set(conf, formatter);
	}

	Object.defineProperty(conf, "entryFormatter", ENTRY_FORMATTER_ALIAS);
}

function withDefaults(given: LogConf): ResolvedLogConf {
	const { entryFormatter, ...rest } = given;
	const conf = {
		...rest,
		clock: orDefault(rest.clock, systemClock),
		colors: orDefault(rest.colors, colorsFromEnv(processEnv()) ?? true),
		logLevel: orDefault(rest.logLevel, DEFAULT_LOG_LEVEL),
		randomBytes: orDefault(rest.randomBytes, platformRandomBytes),
		stderr: orDefault(rest.stderr, console.error),
		stdout: orDefault(rest.stdout, console.log),
		...rest.format === undefined && !entryFormatter ? { format: "text" as const } : {},
	};

	attachFormatter(conf, entryFormatter);

	return conf;
}

// A clone passes the Log it clones as cloneOf.
export function resolveConf(options: LogOptions | LogLevel | "none" | undefined, cloneOf?: Source): { conf: ResolvedLogConf, deprecations: string[] } {
	const { conf: own, deprecation } = ownConf(options);
	const cloned = cloneOf ? inherited(own, cloneOf, "clone") : own;
	const derived = typeof cloned.parentLog === "object" ? inherited(cloned, cloned.parentLog, "child") : cloned;

	rejectQueueBesideShorthand(derived);

	const conf = withDefaults(derived);

	attachDefaultQueue(conf);

	return { conf, deprecations: deprecation ? [deprecation] : [] };
}
