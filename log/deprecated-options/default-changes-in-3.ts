import { colorsDefaultWarning } from "../entry-format.js";
import type { LogConf } from "../types.js";

// The warnings for what 3.0.0 changes where a Log's options say nothing: its text colour follows stdout's TTY flag,
// and an instance with a queue must name its span. `conf` is the options after inheritance, before any default.
// A Log in JSON, one with a `transports` list, or one at "none" writes no text colour of its own.
export function defaultChangeWarnings(conf: LogConf, env: unknown, isTTY: unknown): string[] {
	const warnings: string[] = [];
	const colorWarning = conf.colors === undefined && !conf.transports && conf.format !== "json" && conf.logLevel !== "none" ? colorsDefaultWarning(env, isTTY) : undefined;

	if (colorWarning) {
		warnings.push(colorWarning);
	}

	// 3.0.0 rejects a child or clone of an OTLP instance that has no spanName, so the root Log built from only
	// `otlpHttpBaseURI` stays quiet here, and its children and clones warn. A child that inherits a parent's spanName
	// stays quiet too, until 3.0.0 stops that inheritance.
	if (conf.otlpQueue && !conf.spanName) {
		warnings.push("@larvit/log: spanName is unset on an instance that has an OTLP queue, so its span is named \"unnamed-span\"; 3.0.0 throws there, so set spanName");
	}

	return warnings;
}
