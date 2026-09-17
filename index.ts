export type EntryFormatterConf = {
	// The instance's resolved `colors`. Unset means on.
	colors?: boolean;
	logLevel: LogLevel;
	metadata?: DefinedMetadata;
	msg: string;
	msTimestamp?: number;
};

export type LogConf = {
	// log.fetch only: include the URL query string on the span (sensitive keys still redacted). Default false.
	captureQuery?: boolean;
	// log.fetch only: request header names to record as http.request.header.* (allow-list, none by default).
	captureRequestHeaders?: string[];
	// log.fetch only: response header names to record as http.response.header.* (allow-list, none by default).
	captureResponseHeaders?: string[];
	colors?: boolean;
	context?: Metadata;
	entryFormatter?: (conf: EntryFormatterConf) => string;
	format?: "text" | "json";
	logLevel?: LogLevel | "none";
	// The three otlp* transport options are shorthand for `otlpQueue: new Queue({ ...them })`; never both.
	otlpAdditionalHeaders?: Record<string, string>;
	otlpHttpBaseURI?: string;
	otlpProtocol?: "http/json" | "http/protobuf";
	otlpQueue?: OtlpQueue;
	parentLog?: LogInt;
	printTraceInfo?: boolean;
	spanName?: string;
	stderr?: (msg: string) => void;
	stdout?: (msg: string) => void;
	// Incoming W3C traceparent to adopt: this log joins that trace and nests under that span.
	// Ignored if malformed or if parentLog is set. Edge-only: not inherited by clones/children.
	traceparent?: string;
};

// conf after the constructor fills its defaults: the always-set fields are no longer optional.
export type ResolvedLogConf = LogConf & Required<Pick<LogConf, "colors" | "entryFormatter" | "logLevel" | "stderr" | "stdout">>;

export type Logger = {
	enabled: (logLevel: LogLevel) => boolean;
	/* eslint-disable perfectionist/sort-object-types */
	error: LogShorthand;
	warn: LogShorthand;
	info: LogShorthand;
	verbose: LogShorthand;
	debug: LogShorthand;
	silly: LogShorthand;
	/* eslint-enable perfectionist/sort-object-types */
};

export type LogInt = Logger & {
	conf: LogConf;
	end: (options?: { error?: unknown }) => Promise<void>;
	fetch: (input: string | URL, init?: RequestInit) => Promise<Response>;
	flush: () => Promise<void>;
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
export type MetadataValue = boolean | number | string | undefined;

// What formatters, `log.context` and the OTLP builders receive: the input minus its undefined keys.
export type DefinedMetadata = {
	[key: string]: Exclude<MetadataValue, undefined>;
};

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

function withoutUndefined(metadata: Metadata = {}): DefinedMetadata {
	const defined: DefinedMetadata = {};

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

// Random 8-byte span id as 16 hex chars.
export function generateSpanId(): string {
	return bytesToHex(getRandomBytes(8));
}

// Random 16-byte trace id as 32 hex chars.
export function generateTraceId(): string {
	const bytes = getRandomBytes(16);

	bytes[0] = 0x01; // version 1 trace id

	return bytesToHex(bytes);
}

// W3C `traceparent` header value (`version-traceId-spanId-flags`); sampled by default.
export function formatTraceparent(traceId: string, spanId: string, sampled: boolean = true): string {
	return `00-${traceId}-${spanId}-${sampled ? "01" : "00"}`;
}

// Parses a W3C `traceparent`. Untrusted input: returns null (never throws) for any malformed or
// all-zero value, so the caller cleanly starts a fresh trace instead of continuing.
export function parseTraceparent(header: string): { flags: string, spanId: string, traceId: string } | null {
	const match = /^[0-9a-f]{2}-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/.exec(header.trim().toLowerCase());

	if (!match) {
		return null;
	}

	const [, traceId, spanId, flags] = match;

	// All-zero ids are invalid per the spec; treat them as absent.
	if (/^0+$/.test(traceId) || /^0+$/.test(spanId)) {
		return null;
	}

	return { flags, spanId, traceId };
}

// msTimestamp should be generated from Date.now()
function getNsTimestamp(msTimestamp: number): string {
	const seconds = Math.floor(msTimestamp / 1000);
	const nanos = (msTimestamp % 1000) * 1000000;

	const totalNanos = (BigInt(seconds) * BigInt(1000000000)) + BigInt(nanos);

	return totalNanos.toString();
}

// Total: a throwing getter yields undefined, so the flush path never rejects on its input.
function stringField(value: unknown, key: string): string | undefined {
	try {
		const field: unknown = typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;

		return typeof field === "string" ? field : undefined;
	} catch {
		return undefined;
	}
}

// OTLP partialSuccess: proto3 JSON writes the int64 count as a string, some collectors as a number.
function partialRejection(body: unknown): { error?: string, rejected: number } | undefined {
	let partial: unknown;

	try {
		partial = typeof body === "object" && body !== null ? Reflect.get(body, "partialSuccess") : undefined;
	} catch {
		return undefined;
	}

	if (typeof partial !== "object" || partial === null) return undefined;

	const rejected = Number(Reflect.get(partial, "rejectedLogRecords") ?? Reflect.get(partial, "rejectedSpans") ?? 0);

	return rejected > 0 ? { error: stringField(partial, "errorMessage"), rejected } : undefined;
}

// error.type per OTel semconv; "_OTHER" is its fallback.
function spanFailure(error: unknown): { message: string, type: string } {
	let message = stringField(error, "message");

	if (message === undefined) {
		try {
			message = String(error);
		} catch {
			message = "_OTHER";
		}
	}

	return { message, type: stringField(error, "code") ?? stringField(error, "name") ?? "_OTHER" };
}

// Resource-level OTLP attributes (service.name + telemetry.sdk.*), shared by logs and spans.
// Grafana/Loki reads service.name from here, not from the records.
function buildResourceAttributes(context: DefinedMetadata): OtlpAttribute[] {
	return [
		{ key: "service.name", value: { stringValue: String(context["service.name"] || "unnamed-service") } },
		{ key: "telemetry.sdk.language", value: { stringValue: "ecmascript" } },
		{ key: "telemetry.sdk.name", value: { stringValue: "@larvit/log" } },
		{ key: "telemetry.sdk.version", value: { stringValue: "__version__" } },
	];
}

// Pure builder: state in, OTLP log payload out. Kept out of the class so it is trivially testable.
function buildLogPayload(opts: {
	attributes: DefinedMetadata,
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

// Span finalizer: writes the resolved attributes onto the span, then returns the OTLP payload.
// Not pure — it mutates `span` — but kept out of the class so it stays trivially testable.
function buildSpanPayload(opts: {
	context: DefinedMetadata,
	span: OtlpSpan,
}): OtlpSpanPayload {
	const { context, span } = opts;

	// service.name is carried on the resource scope below, so it is excluded from the span attributes.
	const attributes: OtlpAttribute[] = Object.entries(context)
		.filter(([key]) => key !== "service.name")
		.map(([key, value]) => ({ key, value: { stringValue: String(value) } }));

	if (attributes.length) {
		span.attributes = attributes;
	}

	return {
		resourceSpans: [{
			resource: {
				attributes: buildResourceAttributes(context),
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

	// Embedded message: encode into a sub-writer, then write it length-delimited.
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

function encodeOtlpProtobuf(payload: OtlpLogPayload | OtlpSpanPayload): Uint8Array<ArrayBuffer> {
	return "resourceLogs" in payload ? encodeOtlpLogPayload(payload) : encodeOtlpSpanPayload(payload);
}

// --- OTLP export queue -----------------------------------------------------

export type OtlpPayload = OtlpLogPayload | OtlpSpanPayload;

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
	key?: string;
	maxBatchBytes?: number;
	maxItems?: number;
	otlpAdditionalHeaders?: Record<string, string>;
	otlpHttpBaseURI: string;
	otlpProtocol?: "http/json" | "http/protobuf";
	report?: (msg: string, metadata: DefinedMetadata) => void;
	retryDelayMs?: number;
	storage?: QueueStorage;
};

export type ResolvedQueueConf = QueueConf & Required<Pick<QueueConf, "batchDelayMs" | "key" | "maxBatchBytes" | "maxItems" | "otlpProtocol" | "report" | "retryDelayMs">>;

type QueuedItem = { bytes: number, payload: OtlpPayload };

type SendFailure = { message: string, retry: boolean, status?: number };

// Browsers reject a keepalive request whose body is over 64 KiB.
const KEEPALIVE_MAX_BYTES = 65536;
const OTLP_EXPORT_TIMEOUT_MS = 3000;
const RETRY_DELAY_MAX_MS = 30000;

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
		&& (Array.isArray(Reflect.get(value, "resourceLogs")) || Array.isArray(Reflect.get(value, "resourceSpans")));
}

function otlpPath(payload: OtlpPayload): string {
	return "resourceLogs" in payload ? "/v1/logs" : "/v1/traces";
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
	if ("resourceLogs" in payloads[0]) {
		return mergeLogPayloads(payloads.filter((payload): payload is OtlpLogPayload => "resourceLogs" in payload));
	}

	return mergeSpanPayloads(payloads.filter((payload): payload is OtlpSpanPayload => "resourceSpans" in payload));
}

// A pending retry must not keep a finished Node or Deno process alive.
function unref(timer: ReturnType<typeof setTimeout>): void {
	if (typeof timer === "object" && typeof timer.unref === "function") {
		timer.unref();

		return;
	}

	const deno: unknown = Reflect.get(globalThis, "Deno");
	const unrefTimer: unknown = typeof deno === "object" && deno !== null ? Reflect.get(deno, "unrefTimer") : undefined;

	if (typeof timer === "number" && typeof unrefTimer === "function") {
		unrefTimer(timer);
	}
}

export class Queue implements OtlpQueue {
	readonly conf: ResolvedQueueConf;

	private items: QueuedItem[] = [];
	private bytes = 0;
	private readonly url: string;
	private dropped = 0;
	private failures = 0;
	private batchTimer?: ReturnType<typeof setTimeout>;
	private retryTimer?: ReturnType<typeof setTimeout>;
	private running?: Promise<void>;
	private pending?: Promise<void>;

	// Storage only: leftovers load before the first round, and saves coalesce into one writer.
	private readonly ready: Promise<void>;
	private dirty = false;
	private saving?: Promise<void>;

	constructor(conf: QueueConf) {
		this.conf = {
			...conf,
			batchDelayMs: conf.batchDelayMs ?? 1000,
			key: conf.key ?? "@larvit/log:otlp-queue",
			maxBatchBytes: conf.maxBatchBytes ?? KEEPALIVE_MAX_BYTES,
			maxItems: conf.maxItems ?? 1000,
			otlpProtocol: conf.otlpProtocol ?? "http/json",
			report: conf.report ?? console.error,
			retryDelayMs: conf.retryDelayMs ?? 1000,
		};

		// Validate the endpoint eagerly: a malformed URI fails here, not as an unhandled rejection mid-log.
		const base = new URL(conf.otlpHttpBaseURI);

		this.url = `${base.protocol}//${base.username ? `${base.username}:${base.password}@` : ""}${base.host}${base.pathname.replace(/\/$/, "")}`;
		this.ready = conf.storage ? this.load(conf.storage) : Promise.resolve();
	}

	enqueue(payload: OtlpPayload): void {
		this.add([withBytes(payload)]);
		this.changed();

		if (this.bytes >= this.conf.maxBatchBytes) {
			void this.flush();
		} else {
			this.schedule();
		}
	}

	// While a retry is pending, flush() attempts nothing new: the timer decides.
	flush(): Promise<void> {
		if (this.retryTimer !== undefined) {
			return this.running ?? Promise.resolve();
		}

		if (!this.running) {
			this.running = this.round().finally(() => { this.running = undefined; });

			return this.running;
		}

		this.pending ??= this.running.then(() => {
			this.pending = undefined;

			return this.flush();
		});

		return this.pending;
	}

	private schedule(): void {
		if (this.batchTimer !== undefined || this.retryTimer !== undefined) {
			return;
		}

		this.batchTimer = setTimeout(() => {
			this.batchTimer = undefined;
			void this.flush();
		}, this.conf.batchDelayMs);
	}

	private async round(): Promise<void> {
		await this.ready;
		clearTimeout(this.batchTimer);
		this.batchTimer = undefined;

		while (this.items.length) {
			const batch = this.takeBatch();
			const failure = await this.send(batch);

			if (failure?.retry) {
				this.add(batch, true);
				this.changed();
				this.scheduleRetry(batch, failure);
				break;
			}

			this.failures = 0;
			this.changed();

			if (failure) {
				this.report("OTLP export rejected, batch dropped", this.describe(batch, { error: failure.message, status: failure.status }));
			}
		}

		this.reportDrops();
	}

	private scheduleRetry(batch: QueuedItem[], failure: SendFailure): void {
		this.failures++;

		const retryInMs = Math.min(this.conf.retryDelayMs * (2 ** (this.failures - 1)), RETRY_DELAY_MAX_MS);

		this.retryTimer = setTimeout(() => {
			this.retryTimer = undefined;
			void this.flush();
		}, retryInMs);
		unref(this.retryTimer);
		this.report("OTLP export failed, will retry", { ...this.describe(batch, { error: failure.message, status: failure.status }), retryInMs });
	}

	// The oldest item's kind, plus every later item of the same, up to maxBatchBytes.
	private takeBatch(): QueuedItem[] {
		const logs = "resourceLogs" in this.items[0].payload;
		const batch: QueuedItem[] = [];
		let bytes = 0;

		for (const item of this.items) {
			if (("resourceLogs" in item.payload) !== logs) {
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

	private async send(batch: QueuedItem[]): Promise<SendFailure | undefined> {
		const protobuf = this.conf.otlpProtocol === "http/protobuf";
		let body: string | Uint8Array<ArrayBuffer>;

		// A payload that cannot be encoded (a corrupt stored item, no TextEncoder) never becomes sendable.
		try {
			const payload = mergePayloads(batch.map(item => item.payload));

			body = protobuf ? encodeOtlpProtobuf(payload) : JSON.stringify(payload);
		} catch (err) {
			return { message: stringField(err, "message") ?? "Unencodable OTLP payload", retry: false };
		}

		const bytes = typeof body === "string" ? utf8Length(body) : body.length;

		// AbortController + cleared timer works in browsers and Node, and never leaves a dangling timer.
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), OTLP_EXPORT_TIMEOUT_MS);

		try {
			const res = await fetch(this.url + otlpPath(batch[0].payload), {
				body,
				headers: { "Content-Type": protobuf ? "application/x-protobuf" : "application/json", ...this.conf.otlpAdditionalHeaders },
				keepalive: bytes <= KEEPALIVE_MAX_BYTES,
				method: "POST",
				signal: controller.signal,
			});

			if (!res.ok) {
				return { message: "Non-ok return status", retry: res.status === 408 || res.status === 429 || res.status >= 500, status: res.status };
			}

			// Protobuf responses are binary; only the JSON transport reads the body, for a partialSuccess.
			if (!protobuf) {
				const rejection = partialRejection(await res.json().catch(() => undefined));

				if (rejection) {
					this.report("OTLP export partially rejected", { ...this.describe(batch, { error: rejection.error, status: res.status }), rejected: rejection.rejected });
				}
			}

			return undefined;
		} catch (err) {
			return { message: stringField(err, "message") ?? "Unknown error sending to OTLP", retry: true };
		} finally {
			clearTimeout(timer);
		}
	}

	private describe(batch: QueuedItem[], outcome: { error?: string, status?: number }): DefinedMetadata {
		const path = otlpPath(batch[0].payload);

		return withoutUndefined({ error: outcome.error, items: batch.length, path, status: outcome.status, url: this.url + path });
	}

	private report(msg: string, metadata: DefinedMetadata): void {
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

	// Appends (or, for a failed batch, puts back in front) and drops the oldest over maxItems.
	private add(items: QueuedItem[], front = false): void {
		if (front) {
			this.items.unshift(...items);
		} else {
			this.items.push(...items);
		}

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

			this.add(parsed.map(withBytes), true);

			if (this.items.length) {
				this.schedule();
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

	private changed(): void {
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

// --- log.fetch helpers -----------------------------------------------------

// Query-param keys whose values are replaced with REDACTED when captureQuery is on. Mirrors the
// default deny-list of the official OTel HTTP instrumentations. Matched case-insensitively.
const SENSITIVE_QUERY_KEYS = new Set(["awsaccesskeyid", "signature", "sig", "x-goog-signature"]);

// Builds the `url.full` span attribute. Userinfo is always dropped (origin omits it); the query is
// dropped unless captureQuery is set, in which case sensitive values are redacted.
function buildUrlFull(url: URL, captureQuery: boolean): string {
	const base = url.origin + url.pathname;

	if (!captureQuery || !url.search) {
		return base;
	}

	const params = new URLSearchParams(url.search);

	for (const key of [...params.keys()]) {
		if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) {
			params.set(key, "REDACTED");
		}
	}

	return `${base}?${params.toString()}`;
}

const OTLP_TRANSPORT_KEYS = ["otlpAdditionalHeaders", "otlpHttpBaseURI", "otlpProtocol"] as const;

// The keys of the OTLP spelling `conf` does not use, so inheriting never puts a queue beside an
// endpoint it was not built from.
function otlpKeysNotToInherit(conf: LogConf): (keyof LogConf)[] {
	if (conf.otlpQueue) {
		return [...OTLP_TRANSPORT_KEYS];
	}

	return OTLP_TRANSPORT_KEYS.some(key => conf[key] !== undefined) ? ["otlpQueue"] : [];
}

// A Queue built from exactly these transport options: the one case where both spellings may sit
// together (a clone, a child, a spread conf).
function isQueueFor(queue: OtlpQueue, conf: LogConf): boolean {
	return queue instanceof Queue
		&& queue.conf.otlpHttpBaseURI === conf.otlpHttpBaseURI
		&& queue.conf.otlpProtocol === (conf.otlpProtocol ?? "http/json")
		&& queue.conf.otlpAdditionalHeaders === conf.otlpAdditionalHeaders;
}

export class Log implements LogInt {
	context: DefinedMetadata;
	ended: boolean = false;

	readonly conf: ResolvedLogConf;

	// Un-awaited log.fetch calls, awaited by flush() so their spans are queued before the queue flushes.
	private inFlight = new Set<Promise<unknown>>();

	span: OtlpSpan;

	constructor(conf?: LogConf | LogLevel | "none") {
		if (conf === undefined) {
			conf = {};
		} else if (typeof conf === "string") {
			conf = { logLevel: conf };
		}

		// Inherit conf from parent log if provided
		if (typeof conf.parentLog === "object") {
			const parentConf = conf.parentLog.conf;
			const skip = new Set<keyof LogConf>(otlpKeysNotToInherit(conf));

			for (const key of Object.keys(parentConf) as (keyof LogConf)[]) {
				if (!skip.has(key) && conf[key] === undefined) {
					// Same key on both sides, so the value type matches; `as never` satisfies the writer.
					conf[key] = parentConf[key] as never;
				}
			}
		}

		if (conf.logLevel === undefined) {
			conf.logLevel = "info";
		}

		if (conf.colors === undefined) {
			conf.colors = colorsFromEnv() ?? true;
		}

		if (conf.entryFormatter === undefined && conf.format === "json") {
			conf.entryFormatter = msgJsonFormatter;
		} else if (conf.entryFormatter === undefined) {
			conf.entryFormatter = msgTextFormatter;
		}

		if (conf.stderr === undefined) {
			conf.stderr = console.error;
		}

		if (conf.stdout === undefined) {
			conf.stdout = console.log;
		}

		// Every optional field the resolved type requires has been defaulted above.
		this.conf = conf as ResolvedLogConf;
		// Own copy, so a clone/child never mutates a context object shared with another instance.
		this.context = withoutUndefined(this.conf.context);

		if (this.conf.otlpQueue) {
			if (OTLP_TRANSPORT_KEYS.some(key => this.conf[key] !== undefined) && !isQueueFor(this.conf.otlpQueue, this.conf)) {
				throw new Error("otlpQueue carries the endpoint: set otlpHttpBaseURI, otlpProtocol and otlpAdditionalHeaders on the queue, not beside it");
			}
		} else if (this.conf.otlpHttpBaseURI) {
			this.conf.otlpQueue = new Queue({
				otlpAdditionalHeaders: this.conf.otlpAdditionalHeaders,
				otlpHttpBaseURI: this.conf.otlpHttpBaseURI,
				otlpProtocol: this.conf.otlpProtocol,
				report: (msg, metadata) => this.conf.stderr(this.conf.entryFormatter({ colors: this.conf.colors, logLevel: "error", metadata, msTimestamp: Date.now(), msg })),
			});
		}

		// An in-process parentLog wins; otherwise adopt an incoming traceparent (cross-process parent);
		// otherwise start a fresh trace.
		let incoming: ReturnType<typeof parseTraceparent> = null;

		if (!this.conf.parentLog && this.conf.traceparent) {
			incoming = parseTraceparent(this.conf.traceparent);
		}

		this.span = {
			attributes: [],
			droppedAttributesCount: 0,
			droppedEventsCount: 0,
			droppedLinksCount: 0,
			endTimeUnixNano: getNsTimestamp(Date.now()),
			events: [],
			kind: 1,
			links: [],
			name: this.conf.spanName || "unnamed-span",
			parentSpanId: this.conf.parentLog?.span.spanId ?? incoming?.spanId,
			spanId: generateSpanId(),
			startTimeUnixNano: getNsTimestamp(Date.now()),
			status: { code: 0 },
			traceId: this.conf.parentLog?.span.traceId || incoming?.traceId || generateTraceId(),
		};
	}

	// Create a new instance based on the current instance
	// All options sent in will override the current instance settings
	public clone(conf?: LogConf | LogLevel | "none") {
		if (conf === undefined) {
			conf = {};
		} else if (typeof conf === "string") {
			conf = { logLevel: conf };
		}

		// Resolve the formatter from the effective format, so json<->text can be changed in either direction.
		if (conf.entryFormatter === undefined) {
			if (conf.format === "json") {
				conf.entryFormatter = msgJsonFormatter;
			} else if (conf.format === "text") {
				conf.entryFormatter = msgTextFormatter;
			}
		}

		// Merge context per-key (overrides win) instead of replacing it wholesale.
		conf.context = {
			...this.context,
			...withoutUndefined(conf.context),
		};

		// Inherit every other setting not overridden (log level, sinks, OTLP config, printTraceInfo…),
		// like the constructor does from a parentLog. parentLog/spanName/traceparent are excluded: a
		// clone is its own span, not a child. (A manual allow-list here once dropped newer OTLP options.)
		const skip = new Set<keyof LogConf>(["parentLog", "spanName", "traceparent", ...otlpKeysNotToInherit(conf)]);

		for (const key of Object.keys(this.conf) as (keyof LogConf)[]) {
			if (!skip.has(key) && conf[key] === undefined) {
				conf[key] = this.conf[key] as never;
			}
		}

		return new Log(conf);
	}

	// Ends the span and flushes OTLP. Awaitable: `await log.end()` guarantees delivery before exit.
	// Fire-and-forget (`log.end()`) still works for callers that do not care.
	public async end(options?: { error?: unknown }): Promise<void> {
		if (this.ended) {
			throw new Error("Logging instance is already ended");
		}
		this.ended = true;
		this.span.endTimeUnixNano = getNsTimestamp(Date.now());

		const context: DefinedMetadata = { ...this.context };

		if (options?.error !== undefined && options.error !== null) {
			const failure = spanFailure(options.error);

			this.span.status = { code: 2, message: failure.message };
			context["error.type"] = failure.type;
		}

		this.exportSpan(this.span, context);
		await this.flush();
	}

	// Delivers everything queued so far, un-awaited log.fetch spans included, without ending the span.
	public async flush(): Promise<void> {
		await Promise.all([...this.inFlight]);
		await this.conf.otlpQueue?.flush();
	}

	// The current span's context as a W3C `traceparent` header, for propagating to non-fetch clients.
	public traceparent(): string {
		return formatTraceparent(this.span.traceId, this.span.spanId);
	}

	// Drop-in `fetch`: auto-creates a CLIENT span (nested under this log's span), injects a
	// `traceparent`, records the OTel http.* attributes, and is the only output (no log line). The
	// span is queued when the response arrives and is registered with flush() at call time, so
	// `await log.end()` delivers it even when the fetch wasn't awaited. Only `string`/`URL` inputs are
	// traced; anything else (a `Request`, or a relative URL with no base) passes through to a plain,
	// untraced fetch.
	public fetch(input: string | URL, init?: RequestInit): Promise<Response> {
		if (this.ended) {
			throw new Error("Logging instance is already ended");
		}

		let url: URL;

		try {
			url = new URL(String(input), (globalThis as { location?: { href?: string } }).location?.href);
		} catch {
			return globalThis.fetch(input, init);
		}

		// Register the whole operation synchronously, so a fire-and-forget log.fetch() is still
		// delivered by a later await log.flush().
		let settle!: () => void;

		this.track(new Promise<void>(resolve => { settle = resolve; }));

		return this.tracedFetch(url, init, settle);
	}

	private async tracedFetch(url: URL, init: RequestInit | undefined, settle: () => void): Promise<Response> {
		// childSpan can't throw; everything that can (e.g. `new Headers` on a bad name) is inside the
		// try, so finally always settles the tracked promise and flush() can never hang on this fetch.
		const span = this.childSpan(url.host, 3); // CLIENT; name refined below
		const context: DefinedMetadata = { ...this.context };

		try {
			const method = (init?.method ?? "GET").toUpperCase();

			span.name = `${method} ${url.host}`;
			Object.assign(context, {
				"http.request.method": method,
				"server.address": url.hostname,
				"url.full": buildUrlFull(url, this.conf.captureQuery === true),
				"url.scheme": url.protocol.replace(/:$/, ""),
				...url.port ? { "server.port": Number(url.port) } : {},
			});

			const headers = new Headers(init?.headers);

			if (!headers.has("traceparent")) {
				headers.set("traceparent", formatTraceparent(span.traceId, span.spanId));
			}

			for (const name of this.conf.captureRequestHeaders ?? []) {
				const value = headers.get(name);

				if (value !== null) {
					context[`http.request.header.${name.toLowerCase()}`] = value;
				}
			}

			const res = await globalThis.fetch(url, { ...init, headers });

			context["http.response.status_code"] = res.status;
			span.status.code = res.status >= 400 ? 2 : 0; // 4xx/5xx are errors for client spans

			for (const name of this.conf.captureResponseHeaders ?? []) {
				const value = res.headers.get(name);

				if (value !== null) {
					context[`http.response.header.${name.toLowerCase()}`] = value;
				}
			}

			return res;
		} catch (err) {
			const failure = spanFailure(err);

			span.status = { code: 2, message: failure.message };
			context["error.type"] = failure.type;

			throw err;
		} finally {
			span.endTimeUnixNano = getNsTimestamp(Date.now());
			// settle() must run even if the queue throws, else flush() hangs on this fetch.
			try {
				this.exportSpan(span, context);
			} finally {
				settle();
			}
		}
	}

	public enabled(logLevel: LogLevel): boolean {
		if (this.conf.logLevel === "none") {
			return false;
		}

		// LogLevels.severityNumber is the single source of truth for ordering.
		return LogLevels[logLevel].severityNumber >= LogLevels[this.conf.logLevel].severityNumber;
	}

	public error(msg: string, metadata?: Metadata) { this.log("error", msg, metadata); }
	public warn(msg: string, metadata?: Metadata) { this.log("warn", msg, metadata); }
	public info(msg: string, metadata?: Metadata) { this.log("info", msg, metadata); }
	public verbose(msg: string, metadata?: Metadata) { this.log("verbose", msg, metadata); }
	public debug(msg: string, metadata?: Metadata) { this.log("debug", msg, metadata); }
	public silly(msg: string, metadata?: Metadata) { this.log("silly", msg, metadata); }

	private log(logLevel: LogLevel, msg: string, metadata?: Metadata): void {
		if (this.ended) {
			throw new Error("Logging instance is already ended");
		}

		if (!this.enabled(logLevel)) return;

		const msTimestamp = Date.now();
		const attributes = Object.assign(withoutUndefined(metadata), this.context);

		// Console output, optionally enriched with span/trace info.
		const consoleMetadata: DefinedMetadata = { ...attributes };
		if (this.conf.printTraceInfo) {
			consoleMetadata.spanId = this.span.spanId;
			consoleMetadata.traceId = this.span.traceId;
			consoleMetadata.spanName = this.span.name;
		}
		this.outputToConsole(logLevel, msg, consoleMetadata, msTimestamp);

		if (!this.conf.otlpQueue) {
			return;
		}

		// Logs attach to the parent span when there is one, otherwise to this instance's span.
		const span = this.conf.parentLog?.span.spanId ? this.conf.parentLog.span : this.span;

		this.conf.otlpQueue.enqueue(buildLogPayload({ attributes, logLevel, msTimestamp, msg, span }));
	}

	private track(promise: Promise<unknown>): void {
		this.inFlight.add(promise);
		// The tracked promise only resolves, but stay defensive so a stray rejection can't become unhandled.
		void promise.catch(() => {}).finally(() => this.inFlight.delete(promise));
	}

	private outputToConsole(logLevel: LogLevel, msg: string, metadata: DefinedMetadata, msTimestamp: number) {
		const output = this.conf.entryFormatter({
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

	// A fresh child span under this log's span/trace, with its kind set at birth (no later mutation).
	private childSpan(name: string, kind: OtlpSpan["kind"]): OtlpSpan {
		const now = getNsTimestamp(Date.now());

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
			parentSpanId: this.span.spanId,
			spanId: generateSpanId(),
			startTimeUnixNano: now,
			status: { code: 0 },
			traceId: this.span.traceId,
		};
	}

	// Queues an ended span, deriving its attributes/resource from `context`.
	private exportSpan(span: OtlpSpan, context: DefinedMetadata): void {
		this.conf.otlpQueue?.enqueue(buildSpanPayload({ context, span }));
	}
}
