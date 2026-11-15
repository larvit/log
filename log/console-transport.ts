import { defaultColors, msgJsonFormatter, msgTextFormatter } from "./entry-format.js";
import type { EntryFormatter } from "./types.js";
import type { Transport } from "../tracing/transport.js";
import { withTraceInfo } from "./console-output.js";

export type ConsoleTransportOptions = {
	colors?: boolean;
	format?: "json" | "text" | EntryFormatter;
	printTraceInfo?: boolean;
	stderr?: (msg: string) => void;
	stdout?: (msg: string) => void;
};

// Writes each entry as one line: error and warn to stderr, the other levels to stdout.
export function consoleTransport(options: ConsoleTransportOptions = {}): Transport {
	const colors = options.colors ?? defaultColors();
	const stderr = options.stderr ?? console.error;
	const stdout = options.stdout ?? console.log;
	let format = msgTextFormatter;

	if (typeof options.format === "function") {
		format = options.format;
	} else if (options.format === "json") {
		format = msgJsonFormatter;
	}

	return {
		entry({ logLevel, metadata, msg, msTimestamp, spanId, spanName, traceId }) {
			// A copy, so a formatter that changes it changes no other transport's entry.
			const line = format({ colors, logLevel, metadata: options.printTraceInfo ? withTraceInfo(metadata, { spanId, spanName, traceId }) : { ...metadata }, msTimestamp, msg });

			if (logLevel === "error" || logLevel === "warn") {
				stderr(line);
			} else {
				stdout(line);
			}
		},
	};
}
