import { systemClock } from "../primitives/clock.js";
import { DEFAULT_LOG_LEVEL, type LogLevel } from "../primitives/levels.js";
import { type Metadata, withoutUndefined } from "../primitives/metadata.js";
import { platformRandomBytes } from "../tracing/traceparent.js";
import { attachDefaultQueue, otlpKeysNotToInherit, rejectQueueBesideShorthand } from "./default-queue.js";
import { colorsFromEnv } from "./entry-format.js";
import { attachFormatter, entryFormatterDeprecation, formatterFromOptions, type FormatterSettings, inheritedFormatter, rejectTwoFormatters } from "./formatter-setting.js";
import type { LogConf, LogOptions, ResolvedLogConf } from "./types.js";

// How options become a Log's conf:
// - `new Log(options)`: confFromOptions, then resolveSettings.
// - `log.clone(options)`: confFromOptions, then inherited(…, "clone"), whose settings the constructor
//   hands to resolveSettings.
// - resolveSettings: inherited(…, "child") where parentLog is set, then rejectQueueBesideShorthand and
//   rejectTwoFormatters, then withDefaults, then attachDefaultQueue.

type Derivation = "child" | "clone";

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
	// A source's function formatter reaches a child or clone by inherited() alone, as formatFunction.
	entryFormatter: [],
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

// A conf while it is resolved.
export type LogSettings = Omit<LogOptions, "context" | "entryFormatter" | "format"> & FormatterSettings & { context?: Metadata };

export function confFromOptions(options: LogOptions | LogLevel | "none" | undefined): LogSettings {
	const { context, format, ...rest }: LogOptions = typeof options === "string" ? { logLevel: options } : { ...options };
	// Options from untyped code may be null, which counts as no options.
	const formatFunction = typeof options === "object" && options !== null ? formatterFromOptions(options) : undefined;

	return {
		...rest,
		...context === undefined ? {} : { context: withoutUndefined(context) },
		...typeof format === "function" ? {} : { format },
		...formatFunction ? { formatFunction } : {},
	};
}

function isLogConfKey(key: string): key is keyof LogConf {
	return Object.prototype.hasOwnProperty.call(INHERITED_BY, key);
}

const LOG_CONF_KEYS = Object.keys(INHERITED_BY).filter(isLogConfKey);

// Generic over the key, so the compiler sees one value type on both sides.
function copyKey<K extends keyof LogConf>(target: LogConf, source: LogConf, key: K): void {
	target[key] = source[key];
}

export function inherited(settings: LogSettings, source: { conf: LogConf, context?: Metadata }, derivation: Derivation): LogSettings {
	const skip = new Set(otlpKeysNotToInherit(settings, source.conf));
	const ownsFormatter = settings.format !== undefined || settings.entryFormatter !== undefined || settings.formatFunction !== undefined;

	if (ownsFormatter) {
		skip.add("format");
	}

	const taken: LogConf = {};

	for (const key of LOG_CONF_KEYS) {
		if (INHERITED_BY[key].includes(derivation) && !skip.has(key) && settings[key] === undefined && source.conf[key] !== undefined) {
			copyKey(taken, source.conf, key);
		}
	}

	const formatFunction = ownsFormatter ? undefined : inheritedFormatter(source.conf);

	return {
		...settings,
		...taken,
		// The source's `context` is live, so a caller may have written an undefined into it.
		...derivation === "clone" ? { context: withoutUndefined({ ...source.context, ...settings.context }) } : {},
		...formatFunction ? { formatFunction } : {},
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

function withDefaults(settings: LogSettings): ResolvedLogConf {
	const { entryFormatter, format, formatFunction, ...rest } = settings;
	// A function and an entryFormatter that differ never meet here: a caller's entryFormatter stops
	// inherited() from taking a function, and rejectTwoFormatters throws on a different one beside it.
	const formatter = formatFunction ?? entryFormatter;
	const conf = {
		...rest,
		clock: orDefault(rest.clock, systemClock),
		colors: orDefault(rest.colors, colorsFromEnv(processEnv()) ?? true),
		logLevel: orDefault(rest.logLevel, DEFAULT_LOG_LEVEL),
		randomBytes: orDefault(rest.randomBytes, platformRandomBytes),
		stderr: orDefault(rest.stderr, console.error),
		stdout: orDefault(rest.stdout, console.log),
		...format !== undefined ? { format } : formatter ? {} : { format: "text" as const },
	};

	attachFormatter(conf, formatter);

	return conf;
}

// Defaults come last, since inherited() takes only the keys still unset.
export function resolveSettings(given: LogSettings): { conf: ResolvedLogConf, deprecations: string[] } {
	const settings = typeof given.parentLog === "object" ? inherited(given, given.parentLog, "child") : given;
	const formatterDeprecation = entryFormatterDeprecation(settings);

	rejectQueueBesideShorthand(settings);
	rejectTwoFormatters(settings);

	const conf = withDefaults(settings);

	attachDefaultQueue(conf);

	return { conf, deprecations: formatterDeprecation ? [formatterDeprecation] : [] };
}
