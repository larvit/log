import { type MetadataInput, withoutUndefined } from "../primitives/metadata.js";
import { writeOnce } from "../primitives/once-per-sink.js";
import { formatterOf } from "./entry-format.js";
import type { ResolvedLogConf } from "./types.js";

export function describeLogLevel(value: unknown): string {
	// A proxy trap, getter or toJSON on the value is caller code, and may throw.
	try {
		if (typeof value === "string" || (Array.isArray(value) && value.every(item => typeof item === "string"))) {
			return JSON.stringify(value);
		}

		if (value !== null && (typeof value === "object" || typeof value === "function")) {
			// Object.prototype.toString, so a value's own toString is never called.
			return Object.prototype.toString.call(value);
		}

		return String(value);
	} catch {
		return "(a value that cannot be printed)";
	}
}

export function writeStderr(conf: ResolvedLogConf, logLevel: "error" | "warn", metadata: MetadataInput | undefined, msg: string): void {
	conf.stderr(formatterOf(conf)({ colors: conf.colors, logLevel, metadata: withoutUndefined(metadata), msTimestamp: conf.clock.now(), msg }));
}

export function warnOnceToStderr(conf: ResolvedLogConf, metadata: MetadataInput | undefined, msg: string): void {
	writeOnce(conf.stderr, msg, () => writeStderr(conf, "warn", metadata, msg));
}
