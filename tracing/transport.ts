import type { LogLevel } from "../primitives/levels.js";
import type { Metadata } from "../primitives/metadata.js";
import type { OtlpSpan } from "../otlp/payloads.js";

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

// An ended span of a sampled trace. `attributes` holds what the span is exported with: the context of
// the Log that ended it, with `error.type` and, on a log.fetch span, its HTTP attributes.
export type TransportSpan = { attributes: Metadata, span: OtlpSpan };

// A destination a Log hands entries and spans to. Each kind of record has its own optional method,
// so a kind added later reaches only the transports that have its method.
export type Transport = {
	entry?: (entry: TransportEntry) => void;
	// What it returns is awaited, whatever a promise resolves with.
	flush?: () => unknown;
	span?: (span: TransportSpan) => void;
};
