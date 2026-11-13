import type { LogLevel } from "../primitives/levels.js";
import type { EntryFormatterConf } from "./types.js";

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
