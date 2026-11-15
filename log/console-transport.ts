import { defaultColors, formatterOf } from "./entry-format.js";
import type { EntryFormatter } from "./types.js";
import type { Transport } from "./transport.js";
import { withTraceInfo, writeConsoleLine } from "./console-output.js";

export type ConsoleTransportOptions = {
	colors?: boolean;
	format?: "json" | "text" | EntryFormatter;
	printTraceInfo?: boolean;
	stderr?: (msg: string) => void;
	stdout?: (msg: string) => void;
};

// Writes each entry as one line: error and warn to stderr, the other levels to stdout.
export function consoleTransport(options: ConsoleTransportOptions = {}): Transport {
	const sink = { colors: options.colors ?? defaultColors(), stderr: options.stderr ?? console.error, stdout: options.stdout ?? console.log };
	const format = formatterOf(options.format);

	return {
		entry({ logLevel, metadata, msg, msTimestamp, spanId, spanName, traceId }) {
			// A copy, so a formatter that changes it changes no other transport's entry.
			writeConsoleLine(sink, format, { logLevel, metadata: options.printTraceInfo ? withTraceInfo(metadata, { spanId, spanName, traceId }) : { ...metadata }, msTimestamp, msg });
		},
	};
}
