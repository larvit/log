import type { LogLevel } from "../primitives/levels.js";
import type { Metadata } from "../primitives/metadata.js";
import { queueTransport } from "./queue-transport.js";
import type { ResolvedLogConf } from "./types.js";
import type { TransportSpan } from "../tracing/spans.js";

export type { TransportSpan };

// One call to a level method, as every transport is handed it.
export type TransportEntry = {
	logLevel: LogLevel;
	// The call's metadata under the instance's context.
	metadata: Metadata;
	msg: string;
	msTimestamp: number;
	// The span the entry belongs to: the parent's where the Log has a parentLog.
	spanId: string;
	spanName: string;
	traceId: string;
};

// A destination a Log hands entries and spans to. Each kind of record has its own optional method,
// so a kind added later reaches only the transports that have its method.
export type Transport = {
	entry?: (entry: TransportEntry) => void;
	// What it returns is awaited, whatever a promise resolves with.
	flush?: () => unknown;
	span?: (span: TransportSpan) => void;
};

// The list a Log hands entries and spans to: `transports`, or else what the deprecated options
// make, which is `deprecatedConsole` and then `otlpQueue` where one is set. That default is built
// per call and never kept. So a write to `log.conf.otlpQueue` takes effect from the next record,
// as 2.x documents, and a Log stays within README → Footprint's bytes per instance.
export function transportsOf(conf: Pick<ResolvedLogConf, "otlpQueue" | "transports">, deprecatedConsole?: Transport): readonly Transport[] {
	return conf.transports ?? [
		...deprecatedConsole ? [deprecatedConsole] : [],
		...conf.otlpQueue ? [queueTransport(conf.otlpQueue)] : [],
	];
}
