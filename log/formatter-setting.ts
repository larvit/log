import { msgJsonFormatter, msgTextFormatter } from "./entry-format.js";
import type { EntryFormatter, LogConf, LogOptions, ResolvedLogConf } from "./types.js";

// A Log's formatter goes by these names:
// - `format`: the option, "json" or "text"; a function passed there becomes a function formatter.
// - `entryFormatter`: the deprecated option holding a function formatter; on a resolved conf, a read
//   and write alias of the formatter in use (ENTRY_FORMATTER_ALIAS).
// - `formatFunction`: a function formatter in FormatterSettings, while a conf is being resolved.
// - `confFormatters`: the table below, which holds a function formatter once a conf exists.
// - `formatterOf`: the formatter a conf uses; `resolveFormatter` is its exported form.

// A conf's function formatter, which `conf.format` cannot hold before 3.0.0.
const confFormatters = new WeakMap<object, EntryFormatter>();

export function formatterOf(conf: LogConf): EntryFormatter {
	return confFormatters.get(conf) ?? (conf.format === "json" ? msgJsonFormatter : msgTextFormatter);
}

// On a Log's conf, entryFormatter already returns formatterOf(conf); the fallback serves a hand-built conf without one.
export function resolveFormatter(conf: LogConf): EntryFormatter {
	return conf.entryFormatter ?? formatterOf(conf);
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

// The formatter keys of a conf while it is resolved. A function formatter is kept in formatFunction, not in format.
export interface FormatterSettings { entryFormatter?: EntryFormatter, format?: LogConf["format"], formatFunction?: EntryFormatter }

// The function formatter that options carry: the one in `format`, or, when a Log's own conf is passed
// as options, that Log's. A caller's spread of a Log's conf drops the non-enumerable entryFormatter
// alias, and the function with it, so only the conf itself, unspread, hands the function on.
export function formatterFromOptions(options: LogOptions): EntryFormatter | undefined {
	return typeof options.format === "function" ? options.format : confFormatters.get(options);
}

// The function formatter a child or clone takes from its source, if any.
export function inheritedFormatter(sourceConf: LogConf): EntryFormatter | undefined {
	// The alias's getter marks a conf this copy of the library built. Only confFormatters holds such a conf's
	// function: its entryFormatter reads back a built-in formatter when it has no function.
	const builtHere = Object.getOwnPropertyDescriptor(sourceConf, "entryFormatter")?.get === ENTRY_FORMATTER_ALIAS.get;

	// A conf from another copy of the library, or an older LogInt's, shows its function only as
	// entryFormatter, which wins over its format.
	return confFormatters.get(sourceConf) ?? (builtHere ? undefined : sourceConf.entryFormatter);
}

export function rejectTwoFormatters(settings: FormatterSettings): void {
	if (settings.entryFormatter !== undefined && settings.formatFunction !== undefined && settings.formatFunction !== settings.entryFormatter) {
		throw new Error("entryFormatter and format are two spellings of one formatter: pass only format");
	}
}

export function entryFormatterDeprecation(settings: FormatterSettings): string | undefined {
	if (settings.entryFormatter === undefined) {
		return undefined;
	}

	if (typeof settings.format === "string") {
		return "@larvit/log: entryFormatter is deprecated and removed in 3.0.0, use format — entryFormatter wins and the format beside it is ignored";
	}

	return "@larvit/log: entryFormatter is deprecated and removed in 3.0.0, use format";
}

// Gives a conf its function formatter, if any, and the entryFormatter alias it lacks. Writing
// entryFormatter into the conf first and redefining it turns a data property into an accessor, which
// drops every conf into V8's slow dictionary mode and past README → Footprint.
export function attachFormatter<T extends object>(conf: T, formatter: EntryFormatter | undefined): asserts conf is T & Pick<ResolvedLogConf, "entryFormatter"> {
	if (formatter) {
		confFormatters.set(conf, formatter);
	}

	Object.defineProperty(conf, "entryFormatter", ENTRY_FORMATTER_ALIAS);
}
