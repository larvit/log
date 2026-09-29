// --- Types and the default clock -------------------------------------------

// The library's one source of time; now() returns epoch milliseconds.
export type Clock = {
	clearTimeout: (timer?: TimerHandle) => void;
	now: () => number;
	setTimeout: (callback: () => void, delayMs: number) => TimerHandle;
};

// setTimeout's return: an object in Node, Bun and Deno, a number in browsers and in a test clock.
export type TimerHandle = ReturnType<typeof setTimeout> | number;

const systemClock: Clock = {
	clearTimeout: timer => clearTimeout(timer),
	now: () => Date.now(),
	setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
};

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

	/** @deprecated Removed in 3.0.0: pass `format`. On `log.conf`, keep reading this until 3.0.0; `conf.format` holds no function before then. */
	entryFormatter?: EntryFormatter;
	format?: "text" | "json";
	logLevel?: LogLevel | "none";
	otlpAdditionalHeaders?: Record<string, string>;
	otlpHttpBaseURI?: string;
	otlpProtocol?: "http/json" | "http/protobuf";
	otlpQueue?: OtlpQueue;
	parentLog?: LogInt;
	printTraceInfo?: boolean;
	spanName?: string;
	stderr?: (msg: string) => void;
	stdout?: (msg: string) => void;
	traceparent?: string;
};

export type ResolvedLogConf = LogConf & Required<Pick<LogConf, "clock" | "colors" | "entryFormatter" | "logLevel" | "stderr" | "stdout">>;

export type LogOptions = Omit<LogConf, "context" | "format"> & { context?: MetadataInput, format?: LogConf["format"] | EntryFormatter };

export type Logger = { [level in LogLevel]: (msg: string, metadata?: MetadataInput) => void } & {
	enabled: (logLevel: LogLevel) => boolean;
};

// Stays assignable from a v2.3.0 LogInt until 3.0.0.
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

export type LogLevel = keyof typeof LogLevels;

export type LogShorthand = (msg: string, metadata?: Metadata) => void;

export type Metadata = {
	[key: string]: MetadataValue;
};

// Primitive values only. String() coerces them for OTLP; the JSON formatter keeps them native.
// bigint/objects are excluded: JSON.stringify throws on bigint and renders objects as "[object Object]".
export type MetadataValue = boolean | number | string;

// What a level method and `context` accept: an undefined key is dropped.
export type MetadataInput = {
	[key: string]: MetadataValue | undefined;
};

// --- Levels, metadata and entry formatting ---------------------------------

export const LogLevels = {
	/* eslint-disable sort-keys */
	error: {
		severityNumber: 17,
		severityText: "ERROR",
	},
	warn: {
		severityNumber: 13,
		severityText: "WARN",
	},
	info: {
		severityNumber: 9,
		severityText: "INFO",
	},
	verbose: {
		severityNumber: 6,
		severityText: "DEBUG2",
	},
	debug: {
		severityNumber: 5,
		severityText: "DEBUG",
	},
	silly: {
		severityNumber: 1,
		severityText: "TRACE",
	},
	/* eslint-enable sort-keys */
};

// A Map, so a JavaScript caller's `"constructor"` finds no level and `["debug"]` is never coerced into one.
const SEVERITY_NUMBERS = new Map<unknown, number>(Object.entries(LogLevels).map(([logLevel, { severityNumber }]) => [logLevel, severityNumber]));

function withoutUndefined(metadata: MetadataInput = {}): Metadata {
	const defined: Metadata = {};

	for (const key in metadata) {
		const value = metadata[key];

		if (value !== undefined) defined[key] = value;
	}

	return defined;
}

export function msgJsonFormatter(conf: EntryFormatterConf) {
	// New object: never mutate the caller's metadata. Framework keys win over metadata.
	return JSON.stringify({
		...conf.metadata,
		logLevel: conf.logLevel,
		msg: conf.msg,
		time: new Date(conf.msTimestamp ?? Date.now()).toISOString(),
	});
}

const TEXT_LEVEL_TAGS: Record<LogLevel, { ansi: number, tag: string }> = {
	debug: { ansi: 35, tag: "deb" },
	error: { ansi: 31, tag: "err" },
	info: { ansi: 32, tag: "inf" },
	silly: { ansi: 37, tag: "sil" },
	verbose: { ansi: 34, tag: "ver" },
	warn: { ansi: 33, tag: "war" },
};

// NO_COLOR wins over FORCE_COLOR; FORCE_COLOR=0 and =false disable, as in Node's tty.hasColors.
function colorsFromEnv(): boolean | undefined {
	try {
		const processGlobal: unknown = Reflect.get(globalThis, "process");
		const env: unknown = typeof processGlobal === "object" && processGlobal !== null ? Reflect.get(processGlobal, "env") : undefined;

		if (typeof env !== "object" || env === null) return undefined;
		if (Reflect.get(env, "NO_COLOR")) return false;

		const forceColor: unknown = Reflect.get(env, "FORCE_COLOR");

		if (forceColor === undefined) return undefined;

		return forceColor !== "0" && forceColor !== "false";
	} catch {
		// A permission-gated env may throw on read.
		return undefined;
	}
}

export function msgTextFormatter(conf: EntryFormatterConf) {
	const level = TEXT_LEVEL_TAGS[conf.logLevel];

	if (!level) {
		throw new Error(`Invalid conf.logLevel: "${conf.logLevel}"`);
	}

	const levelOut = conf.colors === false ? level.tag : `\x1b[1;${level.ansi}m${level.tag}\x1b[0m`;
	const date = new Date(conf.msTimestamp ?? Date.now());
	let str = `${date.toISOString().substring(0, 19)}Z [${levelOut}] ${conf.msg}`;
	const metadataStr = JSON.stringify(conf.metadata ?? {});
	if (metadataStr !== "{}") {
		str += ` ${metadataStr}`;
	}

	return str;
}

// A conf's function formatter, which `conf.format` cannot hold before 3.0.0.
const formatFunctions = new WeakMap<object, EntryFormatter>();

function formatterOf(conf: LogConf): EntryFormatter {
	return formatFunctions.get(conf) ?? (conf.format === "json" ? msgJsonFormatter : msgTextFormatter);
}

// --- Trace ids and traceparent ---------------------------------------------

function bytesToHex(bytes: Uint8Array): string {
	return Array.from(bytes).map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function getRandomBytes(size: number): Uint8Array {
	const bytes = new Uint8Array(size);
	const webcrypto = globalThis.crypto;

	if (webcrypto && typeof webcrypto.getRandomValues === "function") {
		webcrypto.getRandomValues(bytes);
	} else {
		// Fallback for runtimes without Web Crypto (eg. default Node 18 without the global flag)
		for (let i = 0; i < size; i++) {
			bytes[i] = Math.floor(Math.random() * 256);
		}
	}

	return bytes;
}

export function generateSpanId(): string {
	return bytesToHex(getRandomBytes(8));
}

export function generateTraceId(): string {
	return bytesToHex(getRandomBytes(16));
}

export function formatTraceparent(traceId: string, spanId: string, sampled: boolean = true): string {
	return `00-${traceId}-${spanId}-${sampled ? "01" : "00"}`;
}

// Parses a W3C `traceparent`. Untrusted input: returns null (never throws) for any malformed,
// version-ff or all-zero value, so the caller cleanly starts a fresh trace instead of continuing.
export function parseTraceparent(header: string): { flags: string, sampled: boolean, spanId: string, traceId: string } | null {
	const match = /^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/.exec(header.trim().toLowerCase());

	if (!match) {
		return null;
	}

	const [, version, traceId, spanId, flags] = match;

	// ff is reserved and all-zero ids are invalid per the spec; treat them as absent.
	if (version === "ff" || /^0+$/.test(traceId) || /^0+$/.test(spanId)) {
		return null;
	}

	return { flags, sampled: (parseInt(flags, 16) & 1) === 1, spanId, traceId };
}

// --- Reading a failure's message and code ----------------------------------

// Total: a throwing getter yields undefined, so the flush path never rejects on its input.
function readField(value: unknown, key: string): unknown {
	try {
		return typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
	} catch {
		return undefined;
	}
}

function stringField(value: unknown, key: string): string | undefined {
	const read = readField(value, key);

	return typeof read === "string" ? read : undefined;
}

function numberFieldAsString(value: unknown, key: string): string | undefined {
	const read = readField(value, key);

	return typeof read === "number" ? String(read) : undefined;
}

// --- OTLP payloads ---------------------------------------------------------

export type OtlpAttribute = {
	key: string,
	value: {
		stringValue: string
	}
};

export type OtlpLogPayload = {
	resourceLogs: {
		resource: {
			attributes: OtlpAttribute[],
		},
		scopeLogs: {
			logRecords: {
				attributes?: OtlpAttribute[],
				body: {
					stringValue: string,
				},
				severityNumber: number,
				severityText: string,
				spanId?: string,
				timeUnixNano: string,
				traceId?: string,
			}[],
		}[],
	}[],
};

export type OtlpSpan = {
	attributes: OtlpAttribute[],
	droppedAttributesCount: number,
	droppedEventsCount: number,
	droppedLinksCount: number,
	endTimeUnixNano: string,
	events: [],
	kind: 0 | 1 | 2 | 3 | 4 | 5,
	links: [],
	name: string,
	parentSpanId?: string,
	spanId: string,
	startTimeUnixNano: string,
	status: { code: number, message?: string },
	traceId: string,
};

export type OtlpSpanPayload = {
	resourceSpans: {
		resource: {
			attributes: OtlpAttribute[],
			droppedAttributesCount: number,
		},
		scopeSpans: {
			scope: {
				name: string,
			},
			spans: OtlpSpan[],
		}[],
	}[],
};

type PayloadByKind = { logs: OtlpLogPayload, traces: OtlpSpanPayload };

type OtlpKind = keyof PayloadByKind;

export type OtlpPayload = PayloadByKind[OtlpKind];

const PAYLOAD_KEYS: { [K in OtlpKind]: keyof PayloadByKind[K] } = { logs: "resourceLogs", traces: "resourceSpans" };

// OTLP's Span.SpanKind and Status.StatusCode enum values.
const SPAN_KIND_INTERNAL = 1;
const SPAN_KIND_CLIENT = 3;
const STATUS_CODE_UNSET = 0;
const STATUS_CODE_ERROR = 2;

// The one branch on a payload's kind, so a new kind fails to compile at every caller.
function byKind<R>(payload: OtlpPayload, handlers: { [K in OtlpKind]: (payload: PayloadByKind[K]) => R }): R {
	if (PAYLOAD_KEYS.logs in payload) {
		return handlers.logs(payload);
	}

	if (PAYLOAD_KEYS.traces in payload) {
		return handlers.traces(payload);
	}

	return payload satisfies never;
}

function payloadKind(payload: OtlpPayload): OtlpKind {
	return byKind<OtlpKind>(payload, { logs: () => "logs", traces: () => "traces" });
}

function getNsTimestamp(msTimestamp: number): string {
	const seconds = Math.floor(msTimestamp / 1000);
	// A performance.now()-based clock hands back fractions finer than a nanosecond.
	const nanos = Math.round((msTimestamp % 1000) * 1000000);

	const totalNanos = (BigInt(seconds) * BigInt(1000000000)) + BigInt(nanos);

	return totalNanos.toString();
}

// Grafana/Loki reads service.name from here, not from the records.
function buildResourceAttributes(attributes: Metadata): OtlpAttribute[] {
	return [
		{ key: "service.name", value: { stringValue: String(attributes["service.name"] || "unnamed-service") } },
		{ key: "telemetry.sdk.language", value: { stringValue: "ecmascript" } },
		{ key: "telemetry.sdk.name", value: { stringValue: "@larvit/log" } },
		{ key: "telemetry.sdk.version", value: { stringValue: "__version__" } },
	];
}

// Unredacted, per README → Goals #3: the message, metadata and context are the caller's own text.
function buildLogPayload(opts: {
	attributes: Metadata,
	logLevel: LogLevel,
	msg: string,
	msTimestamp: number,
	span: OtlpSpan,
}): OtlpLogPayload {
	const { attributes, logLevel, msTimestamp, msg, span } = opts;

	// service.name is carried on the resource (below), so it is excluded from the per-record attributes.
	const recordAttributes: OtlpAttribute[] = Object.entries(attributes)
		.filter(([key]) => key !== "service.name")
		.map(([key, value]) => ({ key, value: { stringValue: String(value) } }));

	return {
		resourceLogs: [{
			resource: { attributes: buildResourceAttributes(attributes) },
			scopeLogs: [{
				logRecords: [{
					...recordAttributes.length ? { attributes: recordAttributes } : {},
					body: { stringValue: msg },
					severityNumber: LogLevels[logLevel].severityNumber,
					severityText: LogLevels[logLevel].severityText,
					spanId: span.spanId,
					timeUnixNano: getNsTimestamp(msTimestamp),
					traceId: span.traceId,
				}],
			}],
		}],
	};
}

// Not pure: writes the resolved attributes onto `span` before returning its payload.
// Unredacted: callers redact what they capture into `attributes`, and per README → Goals #3 the
// context and span name go as written.
function buildSpanPayload(opts: {
	attributes: Metadata,
	span: OtlpSpan,
}): OtlpSpanPayload {
	const { attributes, span } = opts;

	// service.name is carried on the resource scope below, so it is excluded from the span attributes.
	const spanAttributes: OtlpAttribute[] = Object.entries(attributes)
		.filter(([key]) => key !== "service.name")
		.map(([key, value]) => ({ key, value: { stringValue: String(value) } }));

	if (spanAttributes.length) {
		span.attributes = spanAttributes;
	}

	return {
		resourceSpans: [{
			resource: {
				attributes: buildResourceAttributes(attributes),
				droppedAttributesCount: 0,
			},
			scopeSpans: [{
				scope: { name: span.name },
				spans: [span],
			}],
		}],
	};
}

// --- OTLP/HTTP protobuf encoding -------------------------------------------
// Hand-rolled wire encoder for the small, frozen OTLP subset this library emits — zero deps keeps it
// a single self-contained file that runs anywhere. Field numbers are from the OTLP proto defs (v1).

const WIRE_VARINT = 0;
const WIRE_FIXED64 = 1;
const WIRE_LEN = 2;

class ProtoWriter {
	private readonly buf: number[] = [];

	// Uint8Array<ArrayBuffer> (not the ArrayBufferLike default) so the result is a valid fetch BodyInit.
	finish(): Uint8Array<ArrayBuffer> {
		return new Uint8Array(this.buf);
	}

	// Non-negative integer < 2^53 (tags, lengths, enums, counts). Modulo/division sidesteps the
	// 32-bit truncation of bitwise ops, so no BigInt is needed for these.
	private pushVarint(value: number): void {
		while (value > 0x7f) {
			this.buf.push((value % 128) | 0x80);
			value = Math.floor(value / 128);
		}
		this.buf.push(value);
	}

	private pushTag(fieldNo: number, wireType: number): void {
		this.pushVarint((fieldNo * 8) + wireType);
	}

	private pushLen(fieldNo: number, data: ArrayLike<number>): void {
		this.pushTag(fieldNo, WIRE_LEN);
		this.pushVarint(data.length);
		for (let i = 0; i < data.length; i++) {
			this.buf.push(data[i]);
		}
	}

	// int32/uint32/enum/bool field.
	uint(fieldNo: number, value: number): this {
		this.pushTag(fieldNo, WIRE_VARINT);
		this.pushVarint(value);

		return this;
	}

	// fixed64 field from a decimal string (eg. a ns timestamp that overflows Number). 8 bytes, LE.
	fixed64(fieldNo: number, decimal: string): this {
		this.pushTag(fieldNo, WIRE_FIXED64);
		let rest = BigInt(decimal);
		const mask = BigInt(0xff);
		const eight = BigInt(8);

		for (let i = 0; i < 8; i++) {
			this.buf.push(Number(rest & mask));
			rest = rest >> eight;
		}

		return this;
	}

	string(fieldNo: number, value: string): this {
		this.pushLen(fieldNo, new TextEncoder().encode(value));

		return this;
	}

	bytes(fieldNo: number, value: Uint8Array): this {
		this.pushLen(fieldNo, value);

		return this;
	}

	message(fieldNo: number, write: (sub: ProtoWriter) => void): this {
		const sub = new ProtoWriter();

		write(sub);
		this.pushLen(fieldNo, sub.buf);

		return this;
	}
}

function hexToBytes(hex: string): Uint8Array {
	const out = new Uint8Array(hex.length / 2);

	for (let i = 0; i < out.length; i++) {
		out[i] = parseInt(hex.slice(i * 2, (i * 2) + 2), 16);
	}

	return out;
}

// KeyValue { key = 1, value = 2: AnyValue { string_value = 1 } }
function writeKeyValue(writer: ProtoWriter, attr: OtlpAttribute): void {
	writer.string(1, attr.key);
	writer.message(2, value => value.string(1, attr.value.stringValue));
}

// Resource / Span / LogRecord attributes are all repeated KeyValue.
function writeAttributes(writer: ProtoWriter, fieldNo: number, attributes: OtlpAttribute[]): void {
	for (const attr of attributes) {
		writer.message(fieldNo, attrMsg => writeKeyValue(attrMsg, attr));
	}
}

function encodeOtlpLogPayload(payload: OtlpLogPayload): Uint8Array<ArrayBuffer> {
	const root = new ProtoWriter(); // ExportLogsServiceRequest

	for (const resourceLog of payload.resourceLogs) {
		root.message(1, resLogs => { // resource_logs = 1
			resLogs.message(1, resource => writeAttributes(resource, 1, resourceLog.resource.attributes)); // ResourceLogs.resource = 1
			for (const scopeLog of resourceLog.scopeLogs) {
				resLogs.message(2, scopeMsg => { // ResourceLogs.scope_logs = 2
					for (const record of scopeLog.logRecords) {
						scopeMsg.message(2, logRec => { // ScopeLogs.log_records = 2
							logRec.fixed64(1, record.timeUnixNano); // time_unix_nano = 1
							logRec.uint(2, record.severityNumber); // severity_number = 2
							logRec.string(3, record.severityText); // severity_text = 3
							logRec.message(5, body => body.string(1, record.body.stringValue)); // body = 5 (AnyValue.string_value)
							writeAttributes(logRec, 6, record.attributes ?? []); // attributes = 6
							if (record.traceId) logRec.bytes(9, hexToBytes(record.traceId)); // trace_id = 9
							if (record.spanId) logRec.bytes(10, hexToBytes(record.spanId)); // span_id = 10
						});
					}
				});
			}
		});
	}

	return root.finish();
}

function encodeOtlpSpanPayload(payload: OtlpSpanPayload): Uint8Array<ArrayBuffer> {
	const root = new ProtoWriter(); // ExportTraceServiceRequest

	for (const resourceSpan of payload.resourceSpans) {
		root.message(1, resSpans => { // resource_spans = 1
			resSpans.message(1, resource => writeAttributes(resource, 1, resourceSpan.resource.attributes)); // ResourceSpans.resource = 1
			for (const scopeSpan of resourceSpan.scopeSpans) {
				resSpans.message(2, scopeMsg => { // ResourceSpans.scope_spans = 2
					scopeMsg.message(1, scope => scope.string(1, scopeSpan.scope.name)); // ScopeSpans.scope = 1 (InstrumentationScope.name = 1)
					for (const span of scopeSpan.spans) {
						scopeMsg.message(2, spanMsg => { // ScopeSpans.spans = 2
							spanMsg.bytes(1, hexToBytes(span.traceId)); // trace_id = 1
							spanMsg.bytes(2, hexToBytes(span.spanId)); // span_id = 2
							if (span.parentSpanId) spanMsg.bytes(4, hexToBytes(span.parentSpanId)); // parent_span_id = 4
							spanMsg.string(5, span.name); // name = 5
							spanMsg.uint(6, span.kind); // kind = 6
							spanMsg.fixed64(7, span.startTimeUnixNano); // start_time_unix_nano = 7
							spanMsg.fixed64(8, span.endTimeUnixNano); // end_time_unix_nano = 8
							writeAttributes(spanMsg, 9, span.attributes); // attributes = 9
							if (span.status.code) {
								spanMsg.message(15, status => { // status = 15
									if (span.status.message !== undefined) status.string(2, span.status.message); // Status.message = 2
									status.uint(3, span.status.code); // Status.code = 3
								});
							}
						});
					}
				});
			}
		});
	}

	return root.finish();
}

function encodeOtlpProtobuf(payload: OtlpPayload): Uint8Array<ArrayBuffer> {
	return byKind(payload, { logs: encodeOtlpLogPayload, traces: encodeOtlpSpanPayload });
}

// --- OTLP export: types and queued items ----------------------------------

// What Log exports through. Queue is the shipped implementation; any { enqueue, flush } will do.
export type OtlpQueue = {
	enqueue: (payload: OtlpPayload) => void;
	flush: () => Promise<void>;
};

// localStorage and React Native's AsyncStorage satisfy this as they are.
export type QueueStorage = {
	getItem: (key: string) => Promise<string | null | undefined> | string | null | undefined;
	removeItem: (key: string) => Promise<void> | void;
	setItem: (key: string, value: string) => Promise<void> | void;
};

export type QueueConf = {
	batchDelayMs?: number;
	clock?: Clock;
	key?: string;
	maxBatchBytes?: number;
	maxItems?: number;
	otlpAdditionalHeaders?: Record<string, string>;
	otlpHttpBaseURI: string;
	otlpProtocol?: "http/json" | "http/protobuf";
	report?: (msg: string, metadata: Metadata) => void;
	retryDelayMs?: number;
	storage?: QueueStorage;
};

export type ResolvedQueueConf = QueueConf & Required<Pick<QueueConf, "batchDelayMs" | "clock" | "key" | "maxBatchBytes" | "maxItems" | "otlpProtocol" | "report" | "retryDelayMs">>;

type QueuedItem = { bytes: number, payload: OtlpPayload };

type SendFailure = { message: string, reportAs?: string, retry: boolean, status?: number };

// Browsers reject a keepalive request whose body is over 64 KiB.
const KEEPALIVE_MAX_BYTES = 65536;

function utf8Length(str: string): number {
	let bytes = 0;

	for (let i = 0; i < str.length; i++) {
		const code = str.charCodeAt(i);

		if (code < 0x80) {
			bytes += 1;
		} else if (code < 0x800) {
			bytes += 2;
		} else if (code >= 0xd800 && code < 0xdc00) {
			bytes += 4;
			i++;
		} else {
			bytes += 3;
		}
	}

	return bytes;
}

// The JSON size bounds the protobuf size too, so one measure serves both transports.
function withBytes(payload: OtlpPayload): QueuedItem {
	return { bytes: utf8Length(JSON.stringify(payload)), payload };
}

function isOtlpPayload(value: unknown): value is OtlpPayload {
	return typeof value === "object" && value !== null
		&& Object.values(PAYLOAD_KEYS).some(key => Array.isArray(Reflect.get(value, key)));
}

// --- OTLP export: scheduling rounds ----------------------------------------

const RETRY_DELAY_MAX_MS = 30000;

// A pending retry must not keep a finished Node or Deno process alive.
function unref(timer: TimerHandle, fromSystemClock: boolean): void {
	if (typeof timer === "object" && typeof timer.unref === "function") {
		timer.unref();

		return;
	}

	const deno: unknown = Reflect.get(globalThis, "Deno");
	const unrefTimer: unknown = typeof deno === "object" && deno !== null ? Reflect.get(deno, "unrefTimer") : undefined;

	// An injected clock's number may not be a Deno timer id, and unrefing a stranger's is worse.
	if (fromSystemClock && typeof timer === "number" && typeof unrefTimer === "function") {
		unrefTimer(timer);
	}
}

// One round runs at a time, callers arriving mid-round join one next round, and setTimer installs
// the one timer that starts a round — a batch wait, or a backoff flush() must not jump.
type SchedulerConf = Pick<ResolvedQueueConf, "batchDelayMs" | "clock" | "retryDelayMs">;

class ExportScheduler {
	private readonly conf: SchedulerConf;
	private failures = 0;
	private pending?: Promise<void>;
	private readonly ready: Promise<void>;
	private readonly round: () => Promise<void>;
	private running?: Promise<void>;
	private timer?: { handle: TimerHandle, retry: boolean };

	// No round starts before ready settles.
	constructor(conf: SchedulerConf, ready: Promise<void>, round: () => Promise<void>) {
		this.conf = conf;
		this.ready = ready;
		this.round = round;
	}

	// While a retry is pending, flush() attempts nothing new: the timer decides.
	flush(): Promise<void> {
		if (this.timer?.retry) {
			return this.running ?? Promise.resolve();
		}

		if (!this.running) {
			this.running = this.ready.then(() => {
				// The round sends what the timer was waiting for. After ready, or a timer installed before
				// it settles would survive the round.
				this.conf.clock.clearTimeout(this.timer?.handle);
				this.timer = undefined;

				return this.round();
			}).finally(() => { this.running = undefined; });

			return this.running;
		}

		// Both outcomes: a rejection-only skip left pending set, failing every later joiner.
		const next = () => {
			this.pending = undefined;

			return this.flush();
		};

		this.pending ??= this.running.then(next, next);

		return this.pending;
	}

	schedule(): void {
		if (!this.timer) {
			this.setTimer(false, this.conf.batchDelayMs);
		}
	}

	resetBackoff(): void {
		this.failures = 0;
	}

	// A record enqueued mid-round leaves a batch timer behind; the backoff takes it over.
	backoff(): number {
		this.failures++;

		const retryInMs = Math.min(this.conf.retryDelayMs * (2 ** (this.failures - 1)), RETRY_DELAY_MAX_MS);

		unref(this.setTimer(true, retryInMs), this.conf.clock === systemClock);

		return retryInMs;
	}

	// Whatever timer it replaces is cleared, so no stray callback fires.
	private setTimer(retry: boolean, delayMs: number): TimerHandle {
		this.conf.clock.clearTimeout(this.timer?.handle);
		this.timer = undefined;

		const handle = this.conf.clock.setTimeout(() => {
			this.timer = undefined;
			void this.flush();
		}, delayMs);

		this.timer = { handle, retry };

		return handle;
	}
}

// --- OTLP export: sending a batch ------------------------------------------

const OTLP_EXPORT_TIMEOUT_MS = 3000;

// A malformed percent escape passes through undecoded rather than throwing, so an odd password
// cannot break the constructor.
function basicAuth(base: URL): string | undefined {
	if (!base.username && !base.password) {
		return undefined;
	}

	const decoded = [base.username, base.password].map(part => {
		try {
			return decodeURIComponent(part);
		} catch {
			return part;
		}
	});

	return `Basic ${btoa(String.fromCharCode(...new TextEncoder().encode(decoded.join(":"))))}`;
}

// OTLP partialSuccess: proto3 JSON writes the int64 count as a string, some collectors as a number.
function partialRejection(body: unknown): { message?: string, rejected: number } | undefined {
	try {
		const partial: unknown = typeof body === "object" && body !== null ? Reflect.get(body, "partialSuccess") : undefined;

		if (typeof partial !== "object" || partial === null) return undefined;

		const rejected = Number(Reflect.get(partial, "rejectedLogRecords") ?? Reflect.get(partial, "rejectedSpans") ?? 0);

		return rejected > 0 ? { message: stringField(partial, "errorMessage"), rejected } : undefined;
	} catch {
		return undefined;
	}
}

function otlpPath(payload: OtlpPayload): string {
	return byKind(payload, { logs: () => "/v1/logs", traces: () => "/v1/traces" });
}

// Records under one resource share a resourceLogs entry and its single scopeLogs entry.
function mergeLogPayloads(payloads: OtlpLogPayload[]): OtlpLogPayload {
	const byResource = new Map<string, OtlpLogPayload["resourceLogs"][number]>();

	for (const entry of payloads.flatMap(payload => payload.resourceLogs)) {
		const key = JSON.stringify(entry.resource);
		const records = entry.scopeLogs.flatMap(scopeLog => scopeLog.logRecords);
		const merged = byResource.get(key);

		if (merged) {
			merged.scopeLogs[0].logRecords.push(...records);
		} else {
			byResource.set(key, { resource: entry.resource, scopeLogs: [{ logRecords: records }] });
		}
	}

	return { resourceLogs: [...byResource.values()] };
}

// Spans under one resource share a resourceSpans entry, and one scopeSpans entry per scope name.
function mergeSpanPayloads(payloads: OtlpSpanPayload[]): OtlpSpanPayload {
	const byResource = new Map<string, OtlpSpanPayload["resourceSpans"][number]>();

	for (const entry of payloads.flatMap(payload => payload.resourceSpans)) {
		const key = JSON.stringify(entry.resource);
		const merged = byResource.get(key) ?? { resource: entry.resource, scopeSpans: [] };

		byResource.set(key, merged);

		for (const scopeSpan of entry.scopeSpans) {
			const scope = merged.scopeSpans.find(candidate => candidate.scope.name === scopeSpan.scope.name);

			if (scope) {
				scope.spans.push(...scopeSpan.spans);
			} else {
				merged.scopeSpans.push({ scope: scopeSpan.scope, spans: [...scopeSpan.spans] });
			}
		}
	}

	return { resourceSpans: [...byResource.values()] };
}

// A batch holds one kind, so the first payload decides.
function mergePayloads(payloads: OtlpPayload[]): OtlpPayload {
	return byKind<OtlpPayload>(payloads[0], {
		logs: () => mergeLogPayloads(payloads.flatMap(payload =>
			byKind<OtlpLogPayload[]>(payload, { logs: log => [log], traces: () => [] }))),
		traces: () => mergeSpanPayloads(payloads.flatMap(payload =>
			byKind<OtlpSpanPayload[]>(payload, { logs: () => [], traces: span => [span] }))),
	});
}

// Read live, so a rotated otlpAdditionalHeaders reaches the next send; report is the caller's guarded one.
type SenderConf = Pick<ResolvedQueueConf, "clock" | "otlpAdditionalHeaders" | "otlpHttpBaseURI" | "otlpProtocol">;

class OtlpSender {
	private readonly conf: SenderConf;
	private readonly headers: Headers;
	private readonly protobuf: boolean;
	private readonly report: ResolvedQueueConf["report"];
	private readonly url: string;

	constructor(conf: SenderConf, report: ResolvedQueueConf["report"]) {
		let base: URL;

		try {
			base = new URL(conf.otlpHttpBaseURI);
		} catch {
			// Never the URI itself: the thrown error is printed, and a password may be in it.
			throw new Error("otlpHttpBaseURI is not a valid URI; it needs an http:// or https:// prefix, and any / ? # \\ in a password percent-encoded");
		}

		// Any other scheme parses to an opaque path, leaving userinfo in pathname for this.url to
		// reassemble, and nothing but http(s) is fetchable anyway.
		if (base.protocol !== "http:" && base.protocol !== "https:") {
			throw new Error("otlpHttpBaseURI must be an http:// or https:// URI");
		}

		const auth = basicAuth(base);

		this.conf = conf;
		this.protobuf = conf.otlpProtocol === "http/protobuf";
		this.report = report;
		this.url = `${base.protocol}//${base.host}${base.pathname.replace(/\/$/, "")}`;
		this.headers = new Headers({ "Content-Type": this.protobuf ? "application/x-protobuf" : "application/json" });

		if (auth) {
			this.headers.set("Authorization", auth);
		}
	}

	// The value never joins the message; it is the likeliest place for a credential.
	private buildHeaders(): { failure?: string, headers: Headers } {
		const headers = new Headers(this.headers);

		for (const [name, value] of Object.entries(this.conf.otlpAdditionalHeaders ?? {})) {
			try {
				headers.set(name, value);
			} catch {
				return { failure: `otlpAdditionalHeaders carries an invalid ${name} header`, headers };
			}
		}

		return { headers };
	}

	async send(batch: QueuedItem[]): Promise<SendFailure | undefined> {
		const { failure, headers } = this.buildHeaders();

		if (failure) {
			return { message: failure, reportAs: "OTLP export headers invalid, batch dropped", retry: false };
		}

		let body: string | Uint8Array<ArrayBuffer>;

		// A payload that cannot be encoded (a corrupt stored item, no TextEncoder) never becomes sendable.
		try {
			const payload = mergePayloads(batch.map(item => item.payload));

			body = this.protobuf ? encodeOtlpProtobuf(payload) : JSON.stringify(payload);
		} catch (err) {
			return { message: stringField(err, "message") ?? "Unencodable OTLP payload", retry: false };
		}

		const bytes = typeof body === "string" ? utf8Length(body) : body.length;

		// AbortController + cleared timer works in browsers and Node, and never leaves a dangling timer.
		const controller = new AbortController();
		const abortTimer = this.conf.clock.setTimeout(() => controller.abort(), OTLP_EXPORT_TIMEOUT_MS);

		try {
			const res = await fetch(this.url + otlpPath(batch[0].payload), {
				body,
				headers,
				keepalive: bytes <= KEEPALIVE_MAX_BYTES,
				method: "POST",
				signal: controller.signal,
			});

			if (!res.ok) {
				return { message: "Non-ok return status", retry: res.status === 408 || res.status === 429 || res.status >= 500, status: res.status };
			}

			// Protobuf responses are binary; only the JSON transport reads the body, for a partialSuccess.
			if (!this.protobuf) {
				const rejection = partialRejection(await res.json().catch(() => undefined));

				if (rejection) {
					this.report("OTLP export partially rejected", { ...this.describe(batch, { message: rejection.message, status: res.status }), rejected: rejection.rejected });
				}
			}

			return undefined;
		} catch (err) {
			return { message: stringField(err, "message") ?? "Unknown error sending to OTLP", retry: true };
		} finally {
			this.conf.clock.clearTimeout(abortTimer);
		}
	}

	describe(batch: QueuedItem[], outcome: { message?: string, status?: number }): Metadata {
		const path = otlpPath(batch[0].payload);

		return withoutUndefined({ error: outcome.message, items: batch.length, path, status: outcome.status, url: this.url + path });
	}
}

// --- OTLP export queue -----------------------------------------------------

export class Queue implements OtlpQueue {
	readonly conf: ResolvedQueueConf;

	private readonly scheduler: ExportScheduler;
	private readonly sender: OtlpSender;

	// Buffer: bytes is the running sum of items[].bytes, so countAndTrim() and takeBatch() move both together.
	private bytes = 0;
	private dropped = 0;
	private items: QueuedItem[] = [];

	// Storage only: leftovers load before the first round, and saves coalesce into one writer.
	private dirty = false;
	private readonly ready: Promise<void>;
	private saving?: Promise<void>;

	constructor(conf: QueueConf) {
		this.conf = {
			...conf,
			batchDelayMs: conf.batchDelayMs ?? 1000,
			clock: conf.clock ?? systemClock,
			key: conf.key ?? "@larvit/log:otlp-queue",
			maxBatchBytes: conf.maxBatchBytes ?? KEEPALIVE_MAX_BYTES,
			maxItems: conf.maxItems ?? 1000,
			otlpProtocol: conf.otlpProtocol ?? "http/json",
			report: conf.report ?? console.error,
			retryDelayMs: conf.retryDelayMs ?? 1000,
		};

		// A browser's localStorage holds the origin's session tokens, so no stringify or spread may carry it.
		Object.defineProperty(this.conf, "storage", { configurable: true, enumerable: false, value: conf.storage, writable: true });

		// Validate eagerly: a malformed endpoint or clock fails here, not as an unhandled rejection mid-log.
		const { clock } = this.conf;

		if (typeof clock.clearTimeout !== "function" || typeof clock.now !== "function" || typeof clock.setTimeout !== "function") {
			throw new Error("clock must be { now, setTimeout, clearTimeout }");
		}

		this.sender = new OtlpSender(this.conf, (msg, metadata) => this.report(msg, metadata));
		this.ready = conf.storage ? this.load(conf.storage) : Promise.resolve();
		this.scheduler = new ExportScheduler(this.conf, this.ready, () => this.round());
	}

	enqueue(payload: OtlpPayload): void {
		if (!isOtlpPayload(payload)) {
			this.report("OTLP payload of unknown kind, dropped", {});

			return;
		}

		this.append([withBytes(payload)]);
		this.scheduleSave();

		if (this.bytes >= this.conf.maxBatchBytes) {
			void this.flush();
		} else {
			this.scheduler.schedule();
		}
	}

	flush(): Promise<void> {
		return this.scheduler.flush();
	}

	// A pending timer is a circular Timeout on Node, so stringifying working state would throw.
	toJSON(): object {
		return this.conf;
	}

	private async round(): Promise<void> {
		while (this.items.length) {
			const batch = this.takeBatch();
			const failure = await this.sender.send(batch);

			if (failure?.retry) {
				this.prepend(batch);
				this.scheduleSave();

				const retryInMs = this.scheduler.backoff();

				this.report("OTLP export failed, will retry", { ...this.sender.describe(batch, failure), retryInMs });
				break;
			}

			this.scheduler.resetBackoff();
			this.scheduleSave();

			if (failure) {
				this.report(failure.reportAs ?? "OTLP export rejected, batch dropped", this.sender.describe(batch, failure));
			}
		}

		this.reportDrops();
	}

	// The oldest item's kind, plus every later item of the same, up to maxBatchBytes.
	private takeBatch(): QueuedItem[] {
		const kind = payloadKind(this.items[0].payload);
		const batch: QueuedItem[] = [];
		let bytes = 0;

		for (const item of this.items) {
			if (payloadKind(item.payload) !== kind) {
				continue;
			}

			if (batch.length && bytes + item.bytes > this.conf.maxBatchBytes) {
				break;
			}

			batch.push(item);
			bytes += item.bytes;
		}

		const taken = new Set(batch);

		this.items = this.items.filter(item => !taken.has(item));
		this.bytes -= bytes;

		return batch;
	}

	private report(msg: string, metadata: Metadata): void {
		try {
			this.conf.report(msg, metadata);
		} catch {
			// A sink that throws must not break the export loop.
		}
	}

	private reportDrops(): void {
		if (this.dropped) {
			this.report("OTLP queue full, oldest items dropped", { dropped: this.dropped });
			this.dropped = 0;
		}
	}

	private append(items: QueuedItem[]): void {
		this.items.push(...items);
		this.countAndTrim(items);
	}

	// A failed or persisted batch is older than anything queued since, so it goes in front.
	private prepend(items: QueuedItem[]): void {
		this.items.unshift(...items);
		this.countAndTrim(items);
	}

	// Drops the oldest over maxItems.
	private countAndTrim(items: QueuedItem[]): void {
		for (const item of items) {
			this.bytes += item.bytes;
		}

		const excess = this.items.length - this.conf.maxItems;

		if (excess > 0) {
			for (const item of this.items.splice(0, excess)) {
				this.bytes -= item.bytes;
			}

			this.dropped += excess;
		}
	}

	private async load(storage: QueueStorage): Promise<void> {
		try {
			const raw = await storage.getItem(this.conf.key);

			if (!raw) {
				return;
			}

			const parsed: unknown = JSON.parse(raw);

			if (!Array.isArray(parsed) || !parsed.every(isOtlpPayload)) {
				throw new Error("not a list of OTLP payloads");
			}

			this.prepend(parsed.map(withBytes));

			if (this.items.length) {
				this.scheduler.schedule();
			}
		} catch (err) {
			this.report("OTLP queue storage unreadable, discarded", withoutUndefined({ error: stringField(err, "message"), key: this.conf.key }));

			try {
				await storage.removeItem(this.conf.key);
			} catch {
				// The next save overwrites it.
			}
		}
	}

	private scheduleSave(): void {
		if (!this.conf.storage) {
			return;
		}

		this.dirty = true;
		this.saving ??= this.save(this.conf.storage);
	}

	private async save(storage: QueueStorage): Promise<void> {
		await this.ready;

		while (this.dirty) {
			this.dirty = false;

			try {
				if (this.items.length) {
					await storage.setItem(this.conf.key, JSON.stringify(this.items.map(item => item.payload)));
				} else {
					await storage.removeItem(this.conf.key);
				}
			} catch (err) {
				this.report("OTLP queue storage write failed", withoutUndefined({ error: stringField(err, "message"), key: this.conf.key }));
			}
		}

		this.saving = undefined;
	}
}

// --- Credentials on a span -------------------------------------------------

// The `:` is optional and captured, so a scheme-relative `//user:pass@host` — what a runtime
// hands back for a url it could not parse — matches too.
const URL_USERINFO = /(:?\/\/)[^/?#\s]*@/g;
const redactUserinfo = (text: string) => text.replace(URL_USERINFO, "$1REDACTED@");
const holdsUserinfo = (text: string) => redactUserinfo(text) !== text;

// Run by run, never the whole string: decodeURIComponent throws on the first invalid escape.
function percentDecoded(value: string): string {
	return value.replace(/(?:%[0-9A-Fa-f]{2})+/g, run => {
		try {
			return decodeURIComponent(run);
		} catch {
			// Only ASCII spells a url delimiter, so keep a non-UTF-8 run's ASCII and leave the rest.
			return run.replace(/%([0-9A-Fa-f]{2})/g, (escape, hex: string) => parseInt(hex, 16) < 0x80 ? String.fromCharCode(parseInt(hex, 16)) : escape);
		}
	});
}

// URL_USERINFO cannot match without an `@`, and `%40` is the only escape that decodes to one.
const mayHoldUserinfo = (text: string) => text.includes("@") || text.includes("%40");

function redactCredential(value: string): string {
	if (!mayHoldUserinfo(value)) {
		return value;
	}

	return holdsUserinfo(value) || holdsUserinfo(percentDecoded(value)) ? "REDACTED" : value;
}

// Header names carrying a credential by definition: RFC 9110 authentication, RFC 6265 cookies.
const SENSITIVE_HEADER_NAMES = new Set(["authorization", "cookie", "proxy-authorization", "set-cookie"]);

function redactHeaderCredential(name: string, value: string): string {
	return SENSITIVE_HEADER_NAMES.has(name.toLowerCase()) ? "REDACTED" : redactCredential(value);
}

// The URL log.fetch traces: a scheme written without "//" parses to an opaque path, where
// userinfo, or a data: payload, sits in pathname and would ride into url.full.
function traceableUrl(input: string | URL): URL | undefined {
	let url: URL;

	try {
		url = new URL(String(input), (globalThis as { location?: { href?: string } }).location?.href);
	} catch {
		return undefined;
	}

	return url.protocol === "http:" || url.protocol === "https:" ? url : undefined;
}

// Every percent-encoding layer decoded, each dropping tab, CR and LF as a WHATWG parser does; every
// char keeps the index in `text` it came from, or where its escape run starts when that is unclear.
// Without an escape nothing moves, and `sources` is empty. From eight layers on `complete` is false.
function decodedWithSources(text: string): { complete: boolean, decoded: string, sources: number[] } {
	if (!text.includes("%")) {
		return { complete: true, decoded: text, sources: [] };
	}

	let sources = Array.from({ length: text.length }, (_, i) => i);
	let changed = true;

	for (let pass = 0; changed && pass < 8; pass++) {
		let next = "";
		let last = 0;
		const nextSources: number[] = [];
		const keep = (chars: string, source: (offset: number) => number) => {
			for (let offset = 0; offset < chars.length; offset++) {
				if (!"\t\n\r".includes(chars[offset])) {
					next += chars[offset];
					nextSources.push(sources[source(offset)]);
				}
			}
		};

		for (const run of text.matchAll(/(?:%[0-9A-Fa-f]{2})+/g)) {
			const decoded = percentDecoded(run[0]);

			keep(text.slice(last, run.index), offset => last + offset);
			keep(decoded, offset => run.index + (decoded.length * 3 === run[0].length ? offset * 3 : 0));
			last = run.index + run[0].length;
		}

		keep(text.slice(last), offset => last + offset);
		changed = next !== text;
		text = next;
		sources = nextSources;
	}

	return { complete: !changed, decoded: text, sources };
}

const earliest = (starts: (number | undefined)[]) => {
	const found = starts.filter(start => start !== undefined);

	return found.length === 0 ? undefined : Math.min(...found);
};

// An http(s) url starts at its scheme; any other needs non-empty userinfo after `ftp:`, `ws(s):` or
// a doubled slash. Base64 decodes to noise, which userinfo must not run across: printable ASCII only.
function nestedUrlIndex(text: string, printable: boolean): number | undefined {
	// A parser percent-encodes a space in userinfo, so it stays inside.
	const outsideUserinfo = printable ? /[^ -~]|[#/?\\]/ : /[#/?\\]/;
	// One pass from the end, so a path of many candidates stays linear.
	const reachesAt: boolean[] = [];

	for (let i = text.length - 1; i >= 0; i--) {
		reachesAt[i] = text[i] === "@" || (!outsideUserinfo.test(text[i]) && reachesAt[i + 1] === true);
	}

	// A parser splits userinfo at its last `@`, so a leading one is userinfo too.
	const userinfoAt = (i: number) => i < text.length && !outsideUserinfo.test(text[i]) && reachesAt[i + 1] === true;
	let special: number | undefined;
	let doubledSlash: number | undefined;

	for (const match of text.matchAll(/(?:ftp|wss?):[\\/]*/gi)) {
		if (!/[\w+.-]/.test(text[match.index - 1] ?? "") && userinfoAt(match.index + match[0].length)) {
			special = match.index;
			break;
		}
	}

	for (let i = 1; i < text.length; i++) {
		if (/[\\/]/.test(text[i - 1]) && /[\\/]/.test(text[i]) && userinfoAt(i + 1)) {
			doubledSlash = i;
			break;
		}
	}

	return earliest([/https?:/i.exec(text)?.index, special, doubledSlash]);
}

// Every base64 or base64url run, decoded at each of its four alignments, then percent-decoded.
function base64NestedUrlStart(text: string): number | undefined {
	for (const run of text.matchAll(/[\w+/-]{8,}/g)) {
		let start: number | undefined;

		for (let alignment = 0; alignment < 4; alignment++) {
			const chars = run[0].slice(alignment, alignment + (Math.floor((run[0].length - alignment) / 4) * 4));
			const { decoded, sources } = decodedWithSources(atob(chars.replace(/-/g, "+").replace(/_/g, "/")));
			const found = nestedUrlIndex(decoded, true);

			if (found !== undefined) {
				start = Math.min(start ?? Infinity, run.index + alignment + (Math.floor((sources[found] ?? found) / 3) * 4));
			}
		}

		if (start !== undefined) {
			return start;
		}
	}
}

function nestedUrlStart(path: string): number | undefined {
	const { complete, decoded, sources } = decodedWithSources(path);
	// An escape left undecoded may still spell a url, so it cuts too.
	const start = earliest([nestedUrlIndex(decoded, false), base64NestedUrlStart(decoded), complete ? undefined : decoded.indexOf("%")]);

	if (start === undefined) {
		return undefined;
	}

	return sources[start] ?? start;
}

// Every key OTel semconv's default deny-list has named, every S3 and GCS query-signing generation's credential keys, and the names a bearer token or API key travels under.
const SENSITIVE_QUERY_KEYS = new Set(["access_token", "api_key", "apikey", "awsaccesskeyid", "googleaccessid", "key", "sig", "signature", "token", "x-amz-credential", "x-amz-security-token", "x-amz-signature", "x-goog-credential", "x-goog-signature"]);

// A decoded query component holds the space `+` or `%20` spelled, and a parser encodes a space in
// userinfo and drops a tab or newline, so none of them ends userinfo there.
const redactQueryCredential = (text: string) => !mayHoldUserinfo(text) ? text : [text, percentDecoded(text)].some(form => holdsUserinfo(form.replace(/\s/g, ""))) ? "REDACTED" : text;

// A parser drops a tab or newline, so a nested url's `to%09ken` is sent as `token`.
const redactQueryValue = (key: string, value: string) => SENSITIVE_QUERY_KEYS.has(key.replace(/[\t\n\r]/g, "").toLowerCase()) ? "REDACTED" : redactQueryCredential(value);

const formDecoded = (text: string) => percentDecoded(text.replace(/\+/g, " "));

// encodeURIComponent throws on a lone surrogate, which a message's raw text can hold.
const encodedComponent = (text: string) => encodeURIComponent(text.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDFFF]/g, char => char.length === 2 ? char : "\uFFFD"));

// The form-decoding layers until a text spells `//`: `undefined` where none does, `Infinity` where
// it is still percent-encoded after eight.
function layersToUrl(text: string): number | undefined {
	for (let layers = 1; layers <= 8; layers++) {
		const decoded = formDecoded(text);

		if (decoded === text) {
			return undefined;
		}

		text = decoded;

		if (text.includes("//")) {
			return layers;
		}
	}

	return formDecoded(text) === text ? undefined : Infinity;
}

// A pair is decoded to the layer where its key spells `//`, else its value, that layer is redacted,
// and a part it changes is encoded back as many times; `undefined` where neither part is decoded.
// Eight urls deep, the part holding one records `REDACTED`, before the stack runs out.
function redactEncodedPair(key: string, value: string, depth: number): [string, string] | undefined {
	if (key.includes("//")) {
		return undefined;
	}

	const keyLayers = layersToUrl(key);
	const layers = keyLayers ?? (value.includes("//") ? undefined : layersToUrl(value));

	if (layers === undefined) {
		return undefined;
	}

	if (layers === Infinity || depth >= 8) {
		return [keyLayers === undefined ? key : "REDACTED", "REDACTED"];
	}

	// Decoded to the key's layer, a value's own url can lose its shape, so it is redacted at its own too.
	// eslint-disable-next-line @typescript-eslint/no-use-before-define
	const ownValueRedacted = keyLayers !== undefined && redactQueryPair("", value, depth + 1)[1] !== value;
	const decoded = [key, value].map(part => Array.from({ length: layers }).reduce<string>(decodedPart => formDecoded(decodedPart), part));
	// eslint-disable-next-line @typescript-eslint/no-use-before-define
	const redacted = redactQueryPair(decoded[0], decoded[1], depth + 1);
	const encoded = (part: string) => Array.from({ length: layers }).reduce<string>(encodedPart => encodedComponent(encodedPart), part);

	return [redacted[0] === decoded[0] ? key : encoded(redacted[0]), ownValueRedacted ? "REDACTED" : redacted[1] === decoded[1] ? value : encoded(redacted[1])];
}

// A pair is split at its first `=`, and a parser at an authority's last `@`, so the userinfo of a
// url written as a bare key can run on into the value.
const userinfoCrossesAssign = (key: string, value: string) => /\/\/[^/?#]*$/.test(key) && /^[^/?#]*@/.test(value);

// buildUrlFull's cut and query rule, spliced into each url the text quotes, and a fragment records
// `REDACTED`. A url nested in a query pair is redacted inside that pair, so the outer query runs past it.
function redactQuotedUrls(text: string, depth = 0): string {
	const redactPair = (whole: string) => {
		const [rawKey, rawValue = ""] = whole.split(/=([^]*)/, 2);

		if (userinfoCrossesAssign(rawKey, rawValue)) {
			return "REDACTED=REDACTED";
		}

		const encodedPair = redactEncodedPair(rawKey, rawValue, depth);

		if (encodedPair !== undefined) {
			return encodedPair[0] + (whole.includes("=") ? "=" + encodedPair[1] : "");
		}

		const found = !whole.includes("//") ? whole : depth < 8 ? redactQuotedUrls(whole, depth + 1) : "REDACTED";
		const assignAt = found.indexOf("=");
		const key = assignAt < 0 ? found : found.slice(0, assignAt);
		const redacted = redactQueryCredential(key) + (assignAt < 0 ? "" : "=" + redactQueryValue(percentDecoded(key), found.slice(assignAt + 1)));

		if (!whole.includes("//")) {
			return redacted;
		}

		// A server decodes the pair once, so an escaped `?`, `=` or `&` in its raw url is the url's own.
		const [redactedKey, redactedValue = ""] = redacted.split(/=([^]*)/, 2);
		const decoded = [redactedKey, redactedValue].map(formDecoded);
		// eslint-disable-next-line @typescript-eslint/no-use-before-define
		const [decodedKey, decodedValue] = decoded[0] === redactedKey && decoded[1] === redactedValue ? decoded : redactQueryPair(decoded[0], decoded[1], depth + 1);

		return (decodedKey === decoded[0] ? redactedKey : encodedComponent(decodedKey)) + (redacted.includes("=") ? "=" + (decodedValue === decoded[1] ? redactedValue : encodedComponent(decodedValue)) : "");
	};

	// Only whitespace ends a url a runtime quotes as written, so a raw `"` or `<` stays inside it;
	// nested, in a decoded query pair, a space is the url's own.
	const quotedUrl = depth === 0 ? /((?:\bhttps?:)?\/\/[^\s/?#]*)([^\s?#]*)(\?[^\s#]*)?(#\S*)?/gi : /((?:\bhttps?:)?\/\/[^/?#]*)([^?#]*)(\?[^#]*)?(#[^]*)?/gi;

	// Nested, the first url runs to the end, and what precedes it is decoded for one as a path is.
	const firstUrl = depth === 0 ? -1 : text.search(quotedUrl);
	const precedingStart = firstUrl < 0 ? undefined : nestedUrlStart(text.slice(0, firstUrl));

	if (precedingStart !== undefined) {
		return text.slice(0, precedingStart) + "REDACTED";
	}

	return text.replace(quotedUrl, (_, head: string, path: string, query = "", fragment = "") => {
		// A host holding an escape is searched for a url as the path is, so `envoy-http:10000` stays a
		// host; userinfo is redactUserinfo's, whole.
		const hostAt = Math.max(head.indexOf("//") + 2, head.lastIndexOf("@") + 1);
		const searchedAt = head.includes("%", hostAt) ? hostAt : head.length;
		const nestedStart = nestedUrlStart(head.slice(searchedAt) + path);

		if (nestedStart !== undefined) {
			return head.slice(0, searchedAt) + (head.slice(searchedAt) + path).slice(0, nestedStart) + "REDACTED";
		}

		return head + path + (query && "?" + query.slice(1).replace(/[^&]+/g, redactPair)) + (fragment && "#REDACTED");
	});
}

// A url nested in the key owns the value: its last query key names it, so key and value are
// redacted as one text.
function redactQueryPair(key: string, value: string, depth: number): [string, string] {
	if (userinfoCrossesAssign(key, value)) {
		return ["REDACTED", "REDACTED"];
	}

	const encodedPair = redactEncodedPair(key, value, depth);

	if (encodedPair !== undefined) {
		return encodedPair;
	}

	if (!key.includes("//")) {
		return [redactQueryCredential(key), redactQueryValue(key, value.includes("//") ? redactQuotedUrls(value, depth) : value)];
	}

	const redactedKey = redactQuotedUrls(key, depth);
	const redactedPair = redactQuotedUrls(`${key}=${value}`, depth);

	return [redactQueryCredential(redactedKey), redactedPair.startsWith(`${redactedKey}=`) ? redactQueryCredential(redactedPair.slice(redactedKey.length + 1)) : "REDACTED"];
}

// `url.origin` omits userinfo, which is what keeps the outer url's credentials off the span.
function buildUrlFull(url: URL, captureQuery: boolean): string {
	const nestedStart = nestedUrlStart(url.pathname);

	// A nested url's own query parses as this url's, so it goes with the rest.
	if (nestedStart !== undefined) {
		return url.origin + url.pathname.slice(0, nestedStart) + "REDACTED";
	}

	const base = url.origin + url.pathname;

	if (!captureQuery || !url.search) {
		return base;
	}

	const kept = new URLSearchParams();

	// Tested before the decode, which could spell a `/` ending the userinfo early; `&` keeps a leading `?`.
	for (const pair of url.search.slice(1).split("&").filter(Boolean)) {
		const [rawKey, rawValue = ""] = pair.split(/=([^]*)/, 2);

		const [[key, value]] = new URLSearchParams(`&${pair}`);
		const redacted: [string, string] = userinfoCrossesAssign(rawKey, rawValue) ? ["REDACTED", "REDACTED"] : redactQueryPair(key, value, 1);

		kept.append(...redacted);
	}

	return `${base}?${kept.toString()}`;
}

function failureMessage(error: unknown): string {
	let message = stringField(error, "message");

	if (message === undefined) {
		try {
			message = String(error);
		} catch {
			message = "_OTHER";
		}
	}

	return redactUserinfo(redactQuotedUrls(message));
}

// --- Warnings written once per stderr sink ---------------------------------

const warned = new WeakMap<(msg: string) => void, Set<unknown>>();

// Marked before the sink runs, so a sink that itself uses the deprecated spelling cannot recurse.
function firstWarning(conf: ResolvedLogConf, key: unknown): boolean {
	let keys = warned.get(conf.stderr);

	if (!keys) {
		keys = new Set();
		warned.set(conf.stderr, keys);
	}

	if (keys.has(key)) {
		return false;
	}

	keys.add(key);

	return true;
}

function describeLogLevel(value: unknown): string {
	// A proxy trap, getter or toJSON on the value is caller code, and may throw.
	try {
		if (typeof value === "string" || (Array.isArray(value) && value.every(item => typeof item === "string"))) {
			return JSON.stringify(value);
		}

		if (value !== null && (typeof value === "object" || typeof value === "function")) {
			// Object.prototype.toString, so a value's own toString is never called.
			return Object.prototype.toString.call(value);
		}

		return String(value);
	} catch {
		return "(a value that cannot be printed)";
	}
}

function writeWarning(conf: ResolvedLogConf, metadata: MetadataInput | undefined, msg: string): void {
	conf.stderr(formatterOf(conf)({ colors: conf.colors, logLevel: "warn", metadata: withoutUndefined(metadata), msTimestamp: conf.clock.now(), msg }));
}

function warnOnce(conf: ResolvedLogConf, metadata: MetadataInput | undefined, msg: string): void {
	if (firstWarning(conf, msg)) {
		writeWarning(conf, metadata, msg);
	}
}

// --- Resolving a Log's settings --------------------------------------------

const OTLP_TRANSPORT_KEYS = ["otlpAdditionalHeaders", "otlpHttpBaseURI", "otlpProtocol"] as const;

type Derivation = "child" | "clone";

const CHILD_AND_CLONE: readonly Derivation[] = ["child", "clone"];

// Which derivations take a key from their source when the caller leaves it unset.
const INHERITED_BY: { [K in keyof LogConf]-?: readonly Derivation[] } = {
	captureQuery: CHILD_AND_CLONE,
	captureRequestHeaders: CHILD_AND_CLONE,
	captureResponseHeaders: CHILD_AND_CLONE,
	clock: CHILD_AND_CLONE,
	colors: CHILD_AND_CLONE,
	// A clone merges its source's live `context` per key instead.
	context: ["child"],
	// Its function is inherited beside format, by inheritSettings.
	entryFormatter: [],
	format: CHILD_AND_CLONE,
	logLevel: CHILD_AND_CLONE,
	otlpAdditionalHeaders: CHILD_AND_CLONE,
	otlpHttpBaseURI: CHILD_AND_CLONE,
	otlpProtocol: CHILD_AND_CLONE,
	otlpQueue: CHILD_AND_CLONE,
	parentLog: [],
	printTraceInfo: CHILD_AND_CLONE,
	// A clone is its own span.
	spanName: ["child"],
	stderr: CHILD_AND_CLONE,
	stdout: CHILD_AND_CLONE,
	traceparent: [],
};

function sameOrigin(uri: string, other: string): boolean {
	try {
		return new URL(uri).origin === new URL(other).origin;
	} catch {
		return false;
	}
}

// A queue stays only beside the endpoint it was built from; headers only beside their endpoint's origin.
function otlpKeysNotToInherit(conf: LogSettings, sourceConf: LogConf): (keyof LogConf)[] {
	if (conf.otlpQueue) {
		return [...OTLP_TRANSPORT_KEYS];
	}

	if (!OTLP_TRANSPORT_KEYS.some(key => conf[key] !== undefined)) {
		return [];
	}

	if (conf.otlpHttpBaseURI === undefined || sourceConf.otlpHttpBaseURI === undefined || sameOrigin(conf.otlpHttpBaseURI, sourceConf.otlpHttpBaseURI)) {
		return ["otlpQueue"];
	}

	return ["otlpAdditionalHeaders", "otlpQueue"];
}

// Queues a Log built from its otlp* shorthand and wrote into conf beside it, so a child, a clone or a
// spread of that conf carries the pair. Only such a queue passes the rejection below, and only beside
// the exact shorthand it was built from: otlpAdditionalHeaders by reference, as inheritance copies it.
const defaultQueues = new WeakSet<OtlpQueue>();

function isDefaultQueueFor(queue: OtlpQueue, conf: LogSettings): boolean {
	return defaultQueues.has(queue)
		&& queue instanceof Queue
		&& queue.conf.otlpHttpBaseURI === conf.otlpHttpBaseURI
		&& queue.conf.otlpProtocol === (conf.otlpProtocol ?? "http/json")
		&& queue.conf.otlpAdditionalHeaders === conf.otlpAdditionalHeaders;
}

function buildDefaultQueue(conf: ResolvedLogConf, report: QueueConf["report"]): void {
	if (!conf.otlpQueue && conf.otlpHttpBaseURI) {
		conf.otlpQueue = new Queue({
			clock: conf.clock,
			otlpAdditionalHeaders: conf.otlpAdditionalHeaders,
			otlpHttpBaseURI: conf.otlpHttpBaseURI,
			otlpProtocol: conf.otlpProtocol,
			report,
		});
		defaultQueues.add(conf.otlpQueue);
	}
}

function rejectQueueBesideShorthand(conf: LogSettings): void {
	if (conf.otlpQueue && OTLP_TRANSPORT_KEYS.some(key => conf[key] !== undefined) && !isDefaultQueueFor(conf.otlpQueue, conf)) {
		throw new Error("otlpQueue carries the endpoint: set otlpHttpBaseURI, otlpProtocol and otlpAdditionalHeaders on the queue, not beside it");
	}
}

// One descriptor for every instance: Goals #7's 1 KB budget.
const ENTRY_FORMATTER_ALIAS: PropertyDescriptor = {
	configurable: true,
	// So a spread never hands the alias back as an option the caller wrote.
	enumerable: false,
	get(this: ResolvedLogConf): EntryFormatter {
		return formatterOf(this);
	},
	set(this: ResolvedLogConf, formatter: EntryFormatter) {
		formatFunctions.set(this, formatter);
	},
};

// A conf while it is resolved.
type LogSettings = Omit<LogOptions, "context"> & { context?: Metadata };

function confFromOptions(options: LogOptions | LogLevel | "none" | undefined): LogSettings {
	const { context, ...rest }: LogOptions = typeof options === "string" ? { logLevel: options } : { ...options };
	const settings: LogSettings = context === undefined ? rest : { ...rest, context: withoutUndefined(context) };
	const formatFunction = typeof options === "object" ? formatFunctions.get(options) : undefined;

	// So a clone's settings, handed to the constructor, keep the function they inherited.
	if (formatFunction) {
		formatFunctions.set(settings, formatFunction);
	}

	return settings;
}

// One this module did not store — another copy of it, or a v2.3.0 LogInt — shows only as
// entryFormatter, which wins over its format as in v2.3.0.
function sourceFormatFunction(sourceConf: LogConf): EntryFormatter | undefined {
	const stored = formatFunctions.get(sourceConf);

	if (stored || Object.getOwnPropertyDescriptor(sourceConf, "entryFormatter")?.get === ENTRY_FORMATTER_ALIAS.get) {
		return stored;
	}

	return sourceConf.entryFormatter;
}

function inheritSettings(conf: LogSettings, source: { conf: LogConf, context?: Metadata }, derivation: Derivation): void {
	if (derivation === "clone") {
		conf.context = { ...source.context, ...conf.context };
	}

	const skip = new Set(otlpKeysNotToInherit(conf, source.conf));

	if (conf.format === undefined && conf.entryFormatter === undefined && !formatFunctions.has(conf)) {
		const formatFunction = sourceFormatFunction(source.conf);

		if (formatFunction) {
			formatFunctions.set(conf, formatFunction);
		}
	} else {
		skip.add("format");
	}

	for (const key of Object.keys(INHERITED_BY) as (keyof LogConf)[]) {
		if (INHERITED_BY[key].includes(derivation) && !skip.has(key) && conf[key] === undefined && source.conf[key] !== undefined) {
			// Same key on both sides, so the value type matches; `as never` satisfies the writer.
			conf[key] = source.conf[key] as never;
		}
	}
}

function entryFormatterDeprecation(conf: LogSettings): string | undefined {
	if (conf.entryFormatter === undefined) {
		return undefined;
	}

	if (typeof conf.format === "function" && conf.format !== conf.entryFormatter) {
		throw new Error("entryFormatter and format are two spellings of one formatter: pass only format");
	}

	if (typeof conf.format === "string") {
		return "@larvit/log: entryFormatter is deprecated and removed in 3.0.0, use format — entryFormatter wins and the format beside it is ignored";
	}

	return "@larvit/log: entryFormatter is deprecated and removed in 3.0.0, use format";
}

function withDefaults(conf: LogSettings): ResolvedLogConf {
	if (conf.logLevel === undefined) {
		conf.logLevel = "info";
	}

	if (conf.clock === undefined) {
		conf.clock = systemClock;
	}

	if (conf.colors === undefined) {
		conf.colors = colorsFromEnv() ?? true;
	}

	const formatFunction = typeof conf.format === "function" ? conf.format : conf.entryFormatter;

	if (typeof conf.format === "function") {
		delete conf.format;
	}

	if (formatFunction) {
		formatFunctions.set(conf, formatFunction);
	} else if (conf.format === undefined && !formatFunctions.has(conf)) {
		conf.format = "text";
	}

	if (conf.stderr === undefined) {
		conf.stderr = console.error;
	}

	if (conf.stdout === undefined) {
		conf.stdout = console.log;
	}

	Object.defineProperty(conf, "entryFormatter", ENTRY_FORMATTER_ALIAS);

	return conf as ResolvedLogConf;
}

// Defaults come last, so none hides an inherited value; the entryFormatter check precedes them,
// which move a function format out of conf.
function resolveLogConf(options: LogOptions | LogLevel | "none" | undefined, report: QueueConf["report"]): { conf: ResolvedLogConf, deprecations: string[] } {
	const conf = confFromOptions(options);
	const deprecations: string[] = [];

	if (typeof options === "string") {
		deprecations.push("@larvit/log: new Log(\"level\") is deprecated and removed in 3.0.0, use new Log({ logLevel })");
	}

	if (typeof conf.parentLog === "object") {
		inheritSettings(conf, conf.parentLog, "child");
	}

	rejectQueueBesideShorthand(conf);

	const formatterDeprecation = entryFormatterDeprecation(conf);

	if (formatterDeprecation) {
		deprecations.push(formatterDeprecation);
	}

	const resolved = withDefaults(conf);

	buildDefaultQueue(resolved, report);

	return { conf: resolved, deprecations };
}

// --- A Log's spans ---------------------------------------------------------

function openSpan(conf: ResolvedLogConf): { sampled: boolean, span: OtlpSpan } {
	const incoming = !conf.parentLog && conf.traceparent ? parseTraceparent(conf.traceparent) : null;
	const startedAt = getNsTimestamp(conf.clock.now());

	return {
		sampled: conf.parentLog?.sampled ?? incoming?.sampled ?? true,
		span: {
			attributes: [],
			droppedAttributesCount: 0,
			droppedEventsCount: 0,
			droppedLinksCount: 0,
			endTimeUnixNano: startedAt,
			events: [],
			kind: SPAN_KIND_INTERNAL,
			links: [],
			name: conf.spanName || "unnamed-span",
			parentSpanId: conf.parentLog?.span.spanId ?? incoming?.spanId,
			spanId: generateSpanId(),
			startTimeUnixNano: startedAt,
			status: { code: STATUS_CODE_UNSET },
			traceId: conf.parentLog?.span.traceId || incoming?.traceId || generateTraceId(),
		},
	};
}

function childSpan(log: Pick<Log, "conf" | "span">, name: string, kind: OtlpSpan["kind"]): OtlpSpan {
	const now = getNsTimestamp(log.conf.clock.now());

	return {
		attributes: [],
		droppedAttributesCount: 0,
		droppedEventsCount: 0,
		droppedLinksCount: 0,
		endTimeUnixNano: now,
		events: [],
		kind,
		links: [],
		name,
		parentSpanId: log.span.spanId,
		spanId: generateSpanId(),
		startTimeUnixNano: now,
		status: { code: STATUS_CODE_UNSET },
		traceId: log.span.traceId,
	};
}

function exportSpan(log: Pick<Log, "conf" | "sampled">, span: OtlpSpan, attributes: Metadata): void {
	if (log.sampled) {
		log.conf.otlpQueue?.enqueue(buildSpanPayload({ attributes, span }));
	}
}

// --- log.fetch -------------------------------------------------------------

// A throwing clock or queue costs the span, never the platform's result.
async function tracedFetch(log: Pick<Log, "conf" | "context" | "sampled" | "span">, url: URL, init: RequestInit | undefined): Promise<Response> {
	let span: OtlpSpan;

	try {
		span = childSpan(log, url.host, SPAN_KIND_CLIENT);
	} catch {
		return globalThis.fetch(url, init);
	}

	const attributes: Metadata = { ...log.context };

	try {
		const method = (init?.method ?? "GET").toUpperCase();

		span.name = `${method} ${url.host}`;
		Object.assign(attributes, {
			"http.request.method": method,
			"server.address": url.hostname,
			"url.full": buildUrlFull(url, log.conf.captureQuery === true),
			"url.scheme": url.protocol.replace(/:$/, ""),
			...url.port ? { "server.port": Number(url.port) } : {},
		});

		const headers = new Headers(init?.headers);

		if (!headers.has("traceparent")) {
			headers.set("traceparent", formatTraceparent(span.traceId, span.spanId, log.sampled));
		}

		for (const name of log.conf.captureRequestHeaders ?? []) {
			const value = headers.get(name);
			const key = name.toLowerCase();

			if (value !== null) {
				attributes[`http.request.header.${key}`] = redactHeaderCredential(key, value);
			}
		}

		const res = await globalThis.fetch(url, { ...init, headers });

		attributes["http.response.status_code"] = res.status;
		span.status.code = res.status >= 400 ? STATUS_CODE_ERROR : STATUS_CODE_UNSET;

		for (const name of log.conf.captureResponseHeaders ?? []) {
			const value = res.headers.get(name);
			const key = name.toLowerCase();

			if (value !== null) {
				attributes[`http.response.header.${key}`] = redactHeaderCredential(key, value);
			}
		}

		return res;
	} catch (err) {
		span.status = { code: STATUS_CODE_ERROR, message: failureMessage(err) };
		// v2.3.0's documented value; semconv's rule, as end() applies it, waits for 3.0.0.
		attributes["error.type"] = stringField(err, "code") ?? numberFieldAsString(err, "code") ?? stringField(err, "name") ?? "fetch_error";

		throw err;
	} finally {
		try {
			span.endTimeUnixNano = getNsTimestamp(log.conf.clock.now());
			exportSpan(log, span, attributes);
		} catch {
			// The span is dropped.
		}
	}
}

// --- Log -------------------------------------------------------------------

export class Log implements LogInt {
	context: Metadata;
	ended: boolean = false;

	readonly conf: ResolvedLogConf;

	// Un-awaited log.fetch calls, awaited by flush() so their spans are queued before the queue flushes.
	private inFlight = new Set<Promise<unknown>>();

	// W3C sampled flag; false exports no spans and propagates 00.
	readonly sampled: boolean;

	span: OtlpSpan;

	constructor(options?: LogOptions | LogLevel | "none") {
		const { conf, deprecations } = resolveLogConf(options, (msg, metadata) => this.outputToConsole("error", msg, metadata, this.conf.clock.now()));

		this.conf = conf;
		// Own copy, so a clone/child never mutates a context object shared with another instance.
		this.context = withoutUndefined(conf.context);

		for (const msg of deprecations) {
			warnOnce(conf, this.context, msg);
		}

		const { sampled, span } = openSpan(conf);

		this.sampled = sampled;
		this.span = span;
	}

	public clone(options?: LogOptions | LogLevel | "none") {
		if (typeof options === "string") {
			warnOnce(this.conf, this.context, "@larvit/log: log.clone(\"level\") is deprecated and removed in 3.0.0, use log.clone({ logLevel })");
		}

		const conf = confFromOptions(options);

		inheritSettings(conf, this, "clone");

		return new Log(conf);
	}

	public async end(options?: { error?: unknown }): Promise<void> {
		if (this.ended) {
			throw new Error("Logging instance is already ended");
		}
		this.ended = true;

		// What is already queued is delivered even when the span's own close throws.
		try {
			this.span.endTimeUnixNano = getNsTimestamp(this.conf.clock.now());

			const attributes: Metadata = { ...this.context };

			if (options?.error !== undefined && options.error !== null) {
				this.span.status = { code: STATUS_CODE_ERROR, message: failureMessage(options.error) };
				attributes["error.type"] = stringField(options.error, "code") ?? stringField(options.error, "name") ?? "_OTHER";
			}

			exportSpan(this, this.span, attributes);
		} finally {
			await this.flush();
		}
	}

	public async flush(): Promise<void> {
		await Promise.all([...this.inFlight]);
		await this.conf.otlpQueue?.flush();
	}

	public traceparent(): string {
		return formatTraceparent(this.span.traceId, this.span.spanId, this.sampled);
	}

	public fetch(input: string | URL, init?: RequestInit): Promise<Response> {
		if (this.ended) {
			throw new Error("Logging instance is already ended");
		}

		const url = traceableUrl(input);

		if (!url) {
			return globalThis.fetch(input, init);
		}

		// Registered synchronously, so a later await log.flush() delivers a fire-and-forget log.fetch().
		// Settled on the caller's promise, never tracked from it: a handler there would mark its rejection handled.
		let settle!: () => void;

		this.track(new Promise<void>(resolve => { settle = resolve; }));

		return tracedFetch(this, url, init).finally(settle);
	}

	public enabled(logLevel: LogLevel): boolean {
		if (this.conf.logLevel === "none") {
			return false;
		}

		let threshold = SEVERITY_NUMBERS.get(this.conf.logLevel);

		if (threshold === undefined) {
			// Keyed on the raw value, so only the first call builds the message.
			if (firstWarning(this.conf, this.conf.logLevel)) {
				writeWarning(this.conf, undefined, `@larvit/log: logLevel ${describeLogLevel(this.conf.logLevel)} is not a level, logging at "info"; use error, warn, info, verbose, debug, silly or none`);
			}

			threshold = LogLevels.info.severityNumber;
		}

		return (SEVERITY_NUMBERS.get(logLevel) ?? -Infinity) >= threshold;
	}

	public error(msg: string, metadata?: MetadataInput) { this.log("error", msg, metadata); }
	public warn(msg: string, metadata?: MetadataInput) { this.log("warn", msg, metadata); }
	public info(msg: string, metadata?: MetadataInput) { this.log("info", msg, metadata); }
	public verbose(msg: string, metadata?: MetadataInput) { this.log("verbose", msg, metadata); }
	public debug(msg: string, metadata?: MetadataInput) { this.log("debug", msg, metadata); }
	public silly(msg: string, metadata?: MetadataInput) { this.log("silly", msg, metadata); }

	private log(logLevel: LogLevel, msg: string, metadata?: MetadataInput): void {
		if (this.ended) {
			throw new Error("Logging instance is already ended");
		}

		if (!this.enabled(logLevel)) return;

		const msTimestamp = this.conf.clock.now();
		const attributes = Object.assign(withoutUndefined(metadata), this.context);

		const consoleMetadata: Metadata = { ...attributes };
		if (this.conf.printTraceInfo) {
			consoleMetadata.spanId = this.span.spanId;
			consoleMetadata.traceId = this.span.traceId;
			consoleMetadata.spanName = this.span.name;
		}
		this.outputToConsole(logLevel, msg, consoleMetadata, msTimestamp);

		if (!this.conf.otlpQueue) {
			return;
		}

		const span = this.conf.parentLog?.span.spanId ? this.conf.parentLog.span : this.span;

		this.conf.otlpQueue.enqueue(buildLogPayload({ attributes, logLevel, msTimestamp, msg, span }));
	}

	private track(promise: Promise<unknown>): void {
		this.inFlight.add(promise);
		// The tracked promise only resolves, but stay defensive so a stray rejection can't become unhandled.
		void promise.catch(() => {}).finally(() => this.inFlight.delete(promise));
	}

	private outputToConsole(logLevel: LogLevel, msg: string, metadata: Metadata, msTimestamp: number) {
		const output = formatterOf(this.conf)({
			colors: this.conf.colors,
			logLevel,
			metadata,
			msTimestamp,
			msg,
		});

		if (["error", "warn"].includes(logLevel)) {
			this.conf.stderr(output);
		} else {
			this.conf.stdout(output);
		}
	}
}
