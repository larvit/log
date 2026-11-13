// Levels, metadata and entry formatting.

import type { EntryFormatter, EntryFormatterConf, LogConf, LogLevel, Metadata, MetadataInput } from "./types.js";

export const LogLevels = {
	/* eslint-disable sort-keys */
	error: {
		severityNumber: 17,
		severityText: "ERROR",
	},
	warn: {
		severityNumber: 13,
		severityText: "WARN",
	},
	info: {
		severityNumber: 9,
		severityText: "INFO",
	},
	verbose: {
		severityNumber: 6,
		severityText: "DEBUG2",
	},
	debug: {
		severityNumber: 5,
		severityText: "DEBUG",
	},
	silly: {
		severityNumber: 1,
		severityText: "TRACE",
	},
	/* eslint-enable sort-keys */
};

// The level an unset logLevel resolves to, and the one an unknown logLevel logs at.
export const DEFAULT_LOG_LEVEL: LogLevel = "info";

// A Map, so a JavaScript caller's `"constructor"` finds no level and `["debug"]` is never coerced into one.
export const SEVERITY_NUMBERS = new Map<unknown, number>(Object.entries(LogLevels).map(([logLevel, { severityNumber }]) => [logLevel, severityNumber]));

export function withoutUndefined(metadata: MetadataInput = {}): Metadata {
	const defined: Metadata = {};

	for (const key in metadata) {
		const value = metadata[key];

		if (value !== undefined) defined[key] = value;
	}

	return defined;
}

export function msgJsonFormatter(conf: EntryFormatterConf) {
	// New object: never mutate the caller's metadata. Framework keys win over metadata.
	return JSON.stringify({
		...conf.metadata,
		logLevel: conf.logLevel,
		msg: conf.msg,
		time: new Date(conf.msTimestamp ?? Date.now()).toISOString(),
	});
}

const TEXT_LEVEL_TAGS: Record<LogLevel, { ansi: number, tag: string }> = {
	debug: { ansi: 35, tag: "deb" },
	error: { ansi: 31, tag: "err" },
	info: { ansi: 32, tag: "inf" },
	silly: { ansi: 37, tag: "sil" },
	verbose: { ansi: 34, tag: "ver" },
	warn: { ansi: 33, tag: "war" },
};

// The platform reads (processEnv below, pageHref and denoUnrefTimer in their modules) sit at their callers,
// which hand each function the value it needs instead of letting it reach for a global. See docs/decisions.md → "A platform read stays a default".

// The process global's env, or undefined where there is none (browsers) or a permission-gated one throws.
export function processEnv(): unknown {
	try {
		const processGlobal: unknown = Reflect.get(globalThis, "process");

		return typeof processGlobal === "object" && processGlobal !== null ? Reflect.get(processGlobal, "env") : undefined;
	} catch {
		return undefined;
	}
}

// NO_COLOR wins over FORCE_COLOR; FORCE_COLOR=0 and =false disable, as in Node's tty.hasColors.
export function colorsFromEnv(env: unknown): boolean | undefined {
	if (typeof env !== "object" || env === null) return undefined;

	try {
		if (Reflect.get(env, "NO_COLOR")) return false;

		const forceColor: unknown = Reflect.get(env, "FORCE_COLOR");

		if (forceColor === undefined) return undefined;

		return forceColor !== "0" && forceColor !== "false";
	} catch {
		// A permission-gated env may throw on read.
		return undefined;
	}
}

export function msgTextFormatter(conf: EntryFormatterConf) {
	const level = TEXT_LEVEL_TAGS[conf.logLevel];

	if (!level) {
		throw new Error(`Invalid conf.logLevel: "${conf.logLevel}"`);
	}

	const levelOut = conf.colors === false ? level.tag : `\x1b[1;${level.ansi}m${level.tag}\x1b[0m`;
	const date = new Date(conf.msTimestamp ?? Date.now());
	let str = `${date.toISOString()} [${levelOut}] ${conf.msg}`;
	const metadataStr = JSON.stringify(conf.metadata ?? {});
	if (metadataStr !== "{}") {
		str += ` ${metadataStr}`;
	}

	return str;
}

// The formatter goes by these names:
// - `format`: the option, "json" or "text"; a function passed there becomes a function formatter.
// - `entryFormatter`: the deprecated option holding a function formatter; on a resolved conf, a read
//   and write alias of the formatter in use (ENTRY_FORMATTER_ALIAS).
// - `formatFunction`: a function formatter in LogSettings, while a conf is being resolved.
// - `confFormatters`: the table below, which holds a function formatter once a conf exists.
// - `cloneFormatters`: the table in settings.ts through which a clone hands its function formatter to the constructor.
// - `formatterOf`: the formatter a conf uses; `resolveFormatter` is its exported form.

// A conf's function formatter, which `conf.format` cannot hold before 3.0.0.
export const confFormatters = new WeakMap<object, EntryFormatter>();

export function formatterOf(conf: LogConf): EntryFormatter {
	return confFormatters.get(conf) ?? (conf.format === "json" ? msgJsonFormatter : msgTextFormatter);
}

// On a Log's conf, entryFormatter already returns formatterOf(conf); the fallback serves a hand-built conf without one.
export function resolveFormatter(conf: LogConf): EntryFormatter {
	return conf.entryFormatter ?? formatterOf(conf);
}
