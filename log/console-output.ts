import type { EntryFormatter, EntryFormatterConf } from "./types.js";
import type { Metadata } from "../primitives/metadata.js";

// Where a console line goes, and whether it is coloured. A Log's conf is one.
export type ConsoleSink = { colors: boolean, stderr: (msg: string) => void, stdout: (msg: string) => void };

// The one writer of a console line: an entry, from consoleTransport or the deprecated console
// options, and each line this library writes of its own accord.
export function writeConsoleLine(sink: ConsoleSink, format: EntryFormatter, entry: Omit<EntryFormatterConf, "colors">): void {
	const line = format({ colors: sink.colors, ...entry });

	if (entry.logLevel === "error" || entry.logLevel === "warn") {
		sink.stderr(line);
	} else {
		sink.stdout(line);
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
