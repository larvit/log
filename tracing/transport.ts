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

// An ended span of a sampled trace, with the context of the Log that ended it.
export type TransportSpan = { attributes: Metadata, span: OtlpSpan };

// A destination a Log hands entries and spans to. A transport takes a kind of record by having its
// method, so a kind added later, as an optional method, reaches only the transports written for it.
export type Transport = {
	entry?: (entry: TransportEntry) => void;
	flush?: () => Promise<void>;
	span?: (span: TransportSpan) => void;
};
