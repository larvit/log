import type { LogLevel } from "../primitives/levels.js";
import type { Metadata } from "../primitives/metadata.js";
import { formatterOf } from "./formatter-setting.js";
import type { ResolvedLogConf } from "./types.js";

// The one writer of a console line: an entry, and each line this library writes of its own accord.
export function writeConsoleEntry(conf: ResolvedLogConf, logLevel: LogLevel, msg: string, metadata: Metadata, msTimestamp: number): void {
	const line = formatterOf(conf)({ colors: conf.colors, logLevel, metadata, msTimestamp, msg });

	if (logLevel === "error" || logLevel === "warn") {
		conf.stderr(line);
	} else {
		conf.stdout(line);
	}
}
