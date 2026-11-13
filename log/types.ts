import type { OtlpSpan } from "../otlp/payloads.js";
import type { OtlpQueue } from "../otlp/queue-types.js";
import type { Clock } from "../primitives/clock.js";
import type { LogLevel } from "../primitives/levels.js";
import type { Metadata, MetadataInput } from "../primitives/metadata.js";

export type EntryFormatter = (entry: EntryFormatterConf) => string;

export type EntryFormatterConf = {
	// The instance's resolved `colors`. Unset means on.
	colors?: boolean;
	logLevel: LogLevel;
	metadata?: Metadata;
	msg: string;
	msTimestamp?: number;
};

export type LogConf = {
	captureQuery?: boolean;
	captureRequestHeaders?: string[];
	captureResponseHeaders?: string[];
	clock?: Clock;
	colors?: boolean;
	context?: Metadata;

	/** @deprecated Removed in 3.0.0: pass `format`. On `log.conf`, read {@link resolveFormatter}`(log.conf)` instead; `log.conf.format` holds no function before 3.0.0. */
	entryFormatter?: EntryFormatter;
	format?: "json" | "text";
	logLevel?: LogLevel | "none";
	otlpAdditionalHeaders?: Record<string, string>;
	otlpHttpBaseURI?: string;
	otlpProtocol?: "http/json" | "http/protobuf";
	otlpQueue?: OtlpQueue;
	parentLog?: LogInt;
	printTraceInfo?: boolean;

	// Returns `size` random bytes for a trace or span id. Unset, Web Crypto, else `Math.random`.
	randomBytes?: (size: number) => Uint8Array;
	spanName?: string;
	stderr?: (msg: string) => void;
	stdout?: (msg: string) => void;
	traceparent?: string;
};

export type ResolvedLogConf = LogConf & Required<Pick<LogConf, "clock" | "colors" | "entryFormatter" | "logLevel" | "randomBytes" | "stderr" | "stdout">>;

export type LogOptions = Omit<LogConf, "context" | "format"> & { context?: MetadataInput, format?: LogConf["format"] | EntryFormatter };

export type Logger = { [level in LogLevel]: (msg: string, metadata?: MetadataInput) => void } & {
	enabled: (logLevel: LogLevel) => boolean;
};

// An older LogInt, which lacks enabled, flush or sampled, stays assignable until 3.0.0.
export type LogInt = { [level in LogLevel]: LogShorthand } & {
	conf: LogConf;
	enabled?: Logger["enabled"];
	end: (options?: { error?: unknown }) => Promise<void>;
	fetch: (input: string | URL, init?: RequestInit) => Promise<Response>;
	flush?: () => Promise<void>;
	sampled?: boolean;
	span: OtlpSpan;
	traceparent: () => string;
};

export type LogShorthand = (msg: string, metadata?: Metadata) => void;
