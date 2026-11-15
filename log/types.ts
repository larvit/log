import type { Clock } from "../primitives/clock.js";
import type { LogLevel } from "../primitives/levels.js";
import type { Metadata, MetadataInput } from "../primitives/metadata.js";
import type { OtlpQueue } from "../otlp/queue/queue-types.js";
import type { OtlpSpan } from "../otlp/payloads.js";
import type { Transport } from "./transport.js";

export type EntryFormatter = (entry: EntryFormatterConf) => string;

/** @deprecated Renamed in 3.0.0: use {@link LogEntry}. */
export type EntryFormatterConf = {
	// The instance's resolved `colors`. Unset means on.
	colors?: boolean;
	logLevel: LogLevel;
	metadata?: Metadata;
	msg: string;
	msTimestamp?: number;
};

// 3.0.0 renames EntryFormatterConf to this.
export type LogEntry = EntryFormatterConf;

export type LogConf = {
	captureQuery?: boolean;
	captureRequestHeaders?: string[];
	captureResponseHeaders?: string[];
	clock?: Clock;

	/** @deprecated Removed in 3.0.0: pass `transports` with `consoleTransport({ colors })`. */
	colors?: boolean;
	context?: Metadata;

	/** @deprecated Removed in 3.0.0: pass `transports` with `consoleTransport({ format })`. On `log.conf`, read {@link resolveFormatter}`(log.conf)` instead; `log.conf.format` holds no function before 3.0.0. */
	entryFormatter?: EntryFormatter;

	/** @deprecated Removed in 3.0.0: pass `transports` with `consoleTransport({ format })`. */
	format?: "json" | "text";
	logLevel?: LogLevel | "none";

	/** @deprecated Removed in 3.0.0: pass `transports` with `otlpTransport({ headers })`. */
	otlpAdditionalHeaders?: Record<string, string>;

	/** @deprecated Removed in 3.0.0: pass `transports` with `otlpTransport({ baseUrl })`. */
	otlpHttpBaseURI?: string;

	/** @deprecated Removed in 3.0.0: pass `transports` with `otlpTransport({ protocol })`. */
	otlpProtocol?: "http/json" | "http/protobuf";

	/** @deprecated Removed in 3.0.0: pass `transports` with `otlpTransport({ baseUrl })`, or a transport of your own. */
	otlpQueue?: OtlpQueue;
	parentLog?: LogInt;

	/** @deprecated Removed in 3.0.0: pass `transports` with `consoleTransport({ printTraceInfo })`. */
	printTraceInfo?: boolean;

	// Returns `size` random bytes for a trace or span id. Unset, Web Crypto, else `Math.random`.
	randomBytes?: (size: number) => Uint8Array;
	spanName?: string;
	stderr?: (msg: string) => void;

	/** @deprecated Removed in 3.0.0: pass `transports` with `consoleTransport({ stdout })`. */
	stdout?: (msg: string) => void;
	traceparent?: string;

	// Every destination entries and spans go to. Unset, the default list: the console, and OTLP where an otlp* option is set.
	transports?: readonly Transport[];
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
