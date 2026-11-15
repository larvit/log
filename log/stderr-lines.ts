import { type MetadataInput, withoutUndefined } from "../primitives/metadata.js";
import type { ResolvedLogConf } from "./types.js";
import { resolveFormatter } from "./entry-format.js";
import { writeConsoleLine } from "./console-output.js";
import { writeOnce } from "../primitives/once-per-sink.js";

// A line this library writes of its own accord, stamped now: a warning, or the default queue's error report.
export function writeStderr(conf: ResolvedLogConf, logLevel: "error" | "warn", metadata: MetadataInput | undefined, msg: string): void {
	writeConsoleLine(conf, resolveFormatter(conf), { logLevel, metadata: withoutUndefined(metadata), msTimestamp: conf.clock.now(), msg });
}

export function warnOnceToStderr(conf: ResolvedLogConf, metadata: MetadataInput | undefined, msg: string): void {
	writeOnce(conf.stderr, msg, () => writeStderr(conf, "warn", metadata, msg));
}
