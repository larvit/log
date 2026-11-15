import type { LogLevel } from "../primitives/levels.js";
import type { Metadata } from "../primitives/metadata.js";
import type { ResolvedLogConf } from "./types.js";
import { resolveFormatter } from "./conf.js";

// The one writer of a console line: an entry, and each line this library writes of its own accord.
export function writeConsoleEntry(conf: ResolvedLogConf, logLevel: LogLevel, msg: string, metadata: Metadata, msTimestamp: number): void {
	const line = resolveFormatter(conf)({ colors: conf.colors, logLevel, metadata, msTimestamp, msg });

	if (logLevel === "error" || logLevel === "warn") {
		conf.stderr(line);
	} else {
		conf.stdout(line);
	}
}

// `metadata` with the trace info printTraceInfo appends, in the order 2.x prints it.
export function withTraceInfo(metadata: Metadata, span: { spanId: string, spanName: string, traceId: string }): Metadata {
	const printed = { ...metadata };

	printed.spanId = span.spanId;
	printed.traceId = span.traceId;
	printed.spanName = span.spanName;

	return printed;
}
