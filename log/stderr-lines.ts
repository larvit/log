import { type MetadataInput, withoutUndefined } from "../primitives/metadata.js";
import type { ResolvedLogConf } from "./types.js";
import { writeConsoleEntry } from "./console-output.js";
import { writeOnce } from "../primitives/once-per-sink.js";

// A line this library writes of its own accord, stamped now: a warning, or the default queue's error report.
export function writeStderr(conf: ResolvedLogConf, logLevel: "error" | "warn", metadata: MetadataInput | undefined, msg: string): void {
	writeConsoleEntry(conf, logLevel, msg, withoutUndefined(metadata), conf.clock.now());
}

export function warnOnceToStderr(conf: ResolvedLogConf, metadata: MetadataInput | undefined, msg: string): void {
	writeOnce(conf.stderr, msg, () => writeStderr(conf, "warn", metadata, msg));
}
