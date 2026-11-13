import { Queue } from "../otlp/queue.js";
import { DEFAULT_OTLP_PROTOCOL, type OtlpQueue } from "../otlp/queue-items.js";
import { systemClock } from "../primitives/clock.js";
import { DEFAULT_LOG_LEVEL, type LogLevel } from "../primitives/levels.js";
import { type Metadata, withoutUndefined } from "../primitives/metadata.js";
import { platformRandomBytes } from "../tracing/traceparent.js";
import { colorsFromEnv, confFormatters, formatterOf, processEnv } from "./entry-format.js";
import { warnOnceToStderr, writeStderr } from "./stderr-warnings.js";
import type { EntryFormatter, LogConf, LogOptions, ResolvedLogConf } from "./types.js";

// How options become a Log's conf:
// - `new Log(options)`: confFromOptions, then inherited(…, "child") where parentLog is set, then
//   rejectQueueBesideShorthand and rejectTwoFormatters, then withDefaults, then attachDefaultQueue.
// - `log.clone(options)`: confFromOptions, then inherited(…, "clone"), then optionsFromSettings, whose
//   result goes through `new Log` as above.
// Three things need more than copying a LogConf key:
// - A function formatter: formatFunction, or the deprecated entryFormatter option, while settings
//   resolve. withDefaults moves it into confFormatters, keyed by the conf, which the entryFormatter
//   alias reads and writes. A clone hands its own to the constructor through cloneFormatters, keyed by
//   the options; a Log's conf passed as options hands on its own from confFormatters.
// - The default queue: attachDefaultQueue builds it into conf.otlpQueue and marks it in defaultQueues.
// - Warnings: writeOnce, in primitives/once-per-sink.ts. A default queue warns through its Log's
//   stderr, so a message the Log and its queue both raise is written there once.

const OTLP_ENDPOINT_KEYS = ["otlpAdditionalHeaders", "otlpHttpBaseURI", "otlpProtocol"] as const;

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

function sameOrigin(uri: string, other: string): boolean {
	try {
		return new URL(uri).origin === new URL(other).origin;
	} catch {
		return false;
	}
}

// A queue stays only beside the endpoint it was built from; headers only beside their endpoint's origin.
function otlpKeysNotToInherit(conf: LogSettings, sourceConf: LogConf): (keyof LogConf)[] {
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

// Queues a Log built from its otlp* shorthand and wrote into conf beside it, so a child, a clone or a
// spread of that conf carries the pair. Only such a queue passes the rejection below, and only beside
// the exact shorthand it was built from: otlpAdditionalHeaders by reference, as inheritance copies it.
const defaultQueues = new WeakSet<OtlpQueue>();

function isDefaultQueueFor(queue: OtlpQueue, conf: LogSettings): boolean {
	return defaultQueues.has(queue)
		&& queue instanceof Queue
		&& queue.conf.otlpHttpBaseURI === conf.otlpHttpBaseURI
		&& queue.conf.otlpProtocol === (conf.otlpProtocol ?? DEFAULT_OTLP_PROTOCOL)
		&& queue.conf.otlpAdditionalHeaders === conf.otlpAdditionalHeaders;
}

// The one write to a conf after withDefaults builds it. The queue warns through the conf, and can warn
// while the queue is being built, so the conf has to exist first.
function attachDefaultQueue(conf: ResolvedLogConf): void {
	if (!conf.otlpQueue && conf.otlpHttpBaseURI) {
		const report = (msg: string, metadata: Metadata) => writeStderr(conf, "error", metadata, msg);

		conf.otlpQueue = new Queue({
			clock: conf.clock,
			otlpAdditionalHeaders: conf.otlpAdditionalHeaders,
			otlpHttpBaseURI: conf.otlpHttpBaseURI,
			otlpProtocol: conf.otlpProtocol,
			report,
		}, msg => warnOnceToStderr(conf, undefined, msg));
		defaultQueues.add(conf.otlpQueue);
	}
}

function rejectQueueBesideShorthand(conf: LogSettings): void {
	if (conf.otlpQueue && OTLP_ENDPOINT_KEYS.some(key => conf[key] !== undefined) && !isDefaultQueueFor(conf.otlpQueue, conf)) {
		throw new Error("otlpQueue carries the endpoint: set otlpHttpBaseURI, otlpProtocol and otlpAdditionalHeaders on the queue, not beside it");
	}
}

// One descriptor for every instance: README → Footprint's 1 KB budget.
const ENTRY_FORMATTER_ALIAS: PropertyDescriptor = {
	configurable: true,
	// So a spread never hands the alias back as an option the caller wrote.
	enumerable: false,
	get(this: ResolvedLogConf): EntryFormatter {
		return formatterOf(this);
	},
	set(this: ResolvedLogConf, formatter: EntryFormatter) {
		confFormatters.set(this, formatter);
	},
};

// A conf while it is resolved. A function formatter is kept in formatFunction, not in format.
type LogSettings = Omit<LogOptions, "context" | "format"> & { context?: Metadata, format?: LogConf["format"], formatFunction?: EntryFormatter };

// A clone's function formatter, keyed by the options it hands the constructor: an option can't hold a
// function beside the format string the clone also inherits. optionsFromSettings writes it, and
// confFromOptions, called by that constructor, reads it.
const cloneFormatters = new WeakMap<LogOptions, EntryFormatter>();

// The function formatter that options carry outside `format`: a clone's, or, when a Log's own conf is
// passed as options, that Log's. confFromOptions spreads the options, which drops the non-enumerable
// entryFormatter alias and that function with it.
function handedFormatFunction(options: LogOptions): EntryFormatter | undefined {
	return cloneFormatters.get(options) ?? confFormatters.get(options);
}

export function confFromOptions(options: LogOptions | LogLevel | "none" | undefined): LogSettings {
	const { context, format, ...rest }: LogOptions = typeof options === "string" ? { logLevel: options } : { ...options };
	const formatFunction = typeof format === "function" ? format : typeof options === "object" ? handedFormatFunction(options) : undefined;

	return {
		...rest,
		...context === undefined ? {} : { context: withoutUndefined(context) },
		...typeof format === "function" ? {} : { format },
		...formatFunction ? { formatFunction } : {},
	};
}

// A clone's settings as constructor options.
export function optionsFromSettings({ formatFunction, ...options }: LogSettings): LogOptions {
	if (formatFunction) {
		cloneFormatters.set(options, formatFunction);
	}

	return options;
}

// The function formatter a child or clone takes from its source, if any.
function sourceFormatFunction(sourceConf: LogConf): EntryFormatter | undefined {
	// The alias's getter marks a conf this copy of the library built. Only confFormatters holds such a conf's
	// function: its entryFormatter reads back a built-in formatter when it has no function.
	const builtHere = Object.getOwnPropertyDescriptor(sourceConf, "entryFormatter")?.get === ENTRY_FORMATTER_ALIAS.get;

	// A conf from another copy of the library, or an older LogInt's, shows its function only as
	// entryFormatter, which wins over its format.
	return confFormatters.get(sourceConf) ?? (builtHere ? undefined : sourceConf.entryFormatter);
}

function isLogConfKey(key: string): key is keyof LogConf {
	return Object.prototype.hasOwnProperty.call(INHERITED_BY, key);
}

const LOG_CONF_KEYS = Object.keys(INHERITED_BY).filter(isLogConfKey);

// Generic over the key, so the compiler sees one value type on both sides. Keep this a plain
// assignment: an inherited default queue passes isDefaultQueueFor only beside the very
// otlpAdditionalHeaders object it was built with.
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

	const formatFunction = ownsFormatter ? undefined : sourceFormatFunction(source.conf);

	return {
		...settings,
		...taken,
		...derivation === "clone" ? { context: { ...source.context, ...settings.context } } : {},
		...formatFunction ? { formatFunction } : {},
	};
}

function rejectTwoFormatters(settings: LogSettings): void {
	if (settings.entryFormatter !== undefined && settings.formatFunction !== undefined && settings.formatFunction !== settings.entryFormatter) {
		throw new Error("entryFormatter and format are two spellings of one formatter: pass only format");
	}
}

function entryFormatterDeprecation(settings: LogSettings): string | undefined {
	if (settings.entryFormatter === undefined) {
		return undefined;
	}

	if (typeof settings.format === "string") {
		return "@larvit/log: entryFormatter is deprecated and removed in 3.0.0, use format — entryFormatter wins and the format beside it is ignored";
	}

	return "@larvit/log: entryFormatter is deprecated and removed in 3.0.0, use format";
}

// Only undefined is unset: a null is kept, so the check for a bad value still sees it.
function orDefault<T>(value: T | undefined, fallback: T): T {
	return value === undefined ? fallback : value;
}

// Adds the alias to a conf that lacks it. Writing entryFormatter into the conf first and redefining it
// turns a data property into an accessor, which drops every conf into V8's slow dictionary mode and
// past README → Footprint.
function addFormatterAlias<T extends object>(conf: T): asserts conf is T & Pick<ResolvedLogConf, "entryFormatter"> {
	Object.defineProperty(conf, "entryFormatter", ENTRY_FORMATTER_ALIAS);
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

	if (formatter) {
		confFormatters.set(conf, formatter);
	}

	addFormatterAlias(conf);

	return conf;
}

// Defaults come last, since inherited() takes only the keys still unset.
export function resolveLogConf(options: LogOptions | LogLevel | "none" | undefined): { conf: ResolvedLogConf, deprecations: string[] } {
	const given = confFromOptions(options);
	const settings = typeof given.parentLog === "object" ? inherited(given, given.parentLog, "child") : given;
	const deprecations: string[] = [];

	if (typeof options === "string") {
		deprecations.push("@larvit/log: new Log(\"level\") is deprecated and removed in 3.0.0, use new Log({ logLevel })");
	}

	rejectQueueBesideShorthand(settings);
	rejectTwoFormatters(settings);

	const formatterDeprecation = entryFormatterDeprecation(settings);

	if (formatterDeprecation) {
		deprecations.push(formatterDeprecation);
	}

	const conf = withDefaults(settings);

	attachDefaultQueue(conf);

	return { conf, deprecations };
}
