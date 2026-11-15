import { builtInFormatter } from "../entry-format.js";
import type { EntryFormatter, LogConf, LogOptions, ResolvedLogConf } from "../types.js";

// 2.x documents the formatter under two keys: `format`, "json" or "text", and `entryFormatter`, a
// function, which wins over format. A function passed as `format` moves to entryFormatter, so that
// conf.format keeps its 2.x read type. On a Log's own conf, entryFormatter is ENTRY_FORMATTER_ALIAS,
// one accessor that every such conf shares:
// - Read, it answers the function formatter, or else the built-in formatter that format names, so
//   log.conf.entryFormatter is always a formatter, as 2.x types it.
// - It marks a conf this copy of the library built, since no other conf has this getter.

// The function formatter of each conf this copy of the library built with one.
const functionFormatters = new WeakMap<object, EntryFormatter>();

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

// The function formatter a source conf hands on. A conf built here reads a built-in formatter from
// entryFormatter when it has no function. A child or clone must not take that built-in, so that the
// child or clone follows its own format.
export function functionFormatterOf(conf: LogConf): EntryFormatter | undefined {
	return functionFormatters.get(conf) ?? (builtHere(conf) ? undefined : conf.entryFormatter);
}

export function formatterWarning(options: LogOptions): string | undefined {
	if (options.entryFormatter !== undefined) {
		if (typeof options.format === "string") {
			return "@larvit/log: entryFormatter is deprecated and removed in 3.0.0, use transports: [consoleTransport({ format })], see README → Transports — entryFormatter wins and the format beside it is ignored";
		}

		return "@larvit/log: entryFormatter is deprecated and removed in 3.0.0, use transports: [consoleTransport({ format })], see README → Transports";
	}

	if (typeof options.format === "string" && options.format !== "text" && options.format !== "json") {
		return "@larvit/log: format is a string other than \"text\" or \"json\", so text is written; use \"text\", \"json\" or a function";
	}

	return undefined;
}

// attachFormatter runs after the conf is built: writing entryFormatter into it first and redefining it turns a data
// property into an accessor, which drops every conf into V8's slow dictionary mode and past README →
// Footprint.
export function attachFormatter<T extends object>(conf: T, formatter: EntryFormatter | undefined): asserts conf is T & Pick<ResolvedLogConf, "entryFormatter"> {
	// A Log with no function formatter stays out of functionFormatters: a place in it costs about 42
	// bytes against README → Footprint.
	if (formatter) {
		functionFormatters.set(conf, formatter);
	}

	Object.defineProperty(conf, "entryFormatter", ENTRY_FORMATTER_ALIAS);
}

// The function formatter this copy of the library built into `conf`, if `conf` is a Log's own.
export function ownFunctionFormatter(conf: object): EntryFormatter | undefined {
	return functionFormatters.get(conf);
}
