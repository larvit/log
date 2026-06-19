export type EntryFormatterConf = {
	logLevel: LogLevel;
	metadata?: Metadata;
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
	context?: Metadata;
	entryFormatter?: (conf: EntryFormatterConf) => string;
	format?: "text" | "json";
	logLevel?: LogLevel | "none";
	otlpAdditionalHeaders?: Record<string, string>;
	otlpHttpBaseURI?: string;
	otlpProtocol?: "http/json" | "http/protobuf";
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
export type ResolvedLogConf = LogConf & Required<Pick<LogConf, "entryFormatter" | "logLevel" | "stderr" | "stdout">>;

export type LogInt = {
	conf: LogConf;
	fetch: (input: string | URL, init?: RequestInit) => Promise<Response>;
	span: OtlpSpan;
	traceparent: () => string;
	/* eslint-disable perfectionist/sort-object-types */
	error: LogShorthand;
	warn: LogShorthand;
	info: LogShorthand;
	verbose: LogShorthand;
	debug: LogShorthand;
	silly: LogShorthand;
	end: () => Promise<void>;
	/* eslint-enable perfectionist/sort-object-types */
};

export type LogLevel = keyof typeof LogLevels;

export type LogShorthand = (msg: string, metadata?: Metadata) => void;

export type Metadata = {
	[key: string]: MetadataValue;
};

// Primitive values only. String() coerces them for OTLP; the JSON formatter keeps them native.
// bigint/objects are excluded: JSON.stringify throws on bigint and renders objects as "[object Object]".
export type MetadataValue = boolean | number | string;

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
	status: { code: number },
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

type FetchError = {
	message: string;
	status?: number;
};

// Fixed OTLP export timeout (ms). Bounds each fetch so end() can never hang on an unresponsive collector.
const OTLP_EXPORT_TIMEOUT_MS = 3000;

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

export function msgJsonFormatter(conf: EntryFormatterConf) {
	// New object: never mutate the caller's metadata. Framework keys win over metadata.
	return JSON.stringify({
		...conf.metadata,
		logLevel: conf.logLevel,
		msg: conf.msg,
		time: new Date(conf.msTimestamp ?? Date.now()).toISOString(),
	});
}

export function msgTextFormatter(conf: EntryFormatterConf) {
	let levelOut: string;

	if (conf.logLevel === "silly") {
		levelOut = "\x1b[1;37msil\x1b[0m";
	} else if (conf.logLevel === "debug") {
		levelOut = "\x1b[1;35mdeb\x1b[0m";
	} else if (conf.logLevel === "verbose") {
		levelOut = "\x1b[1;34mver\x1b[0m";
	} else if (conf.logLevel === "info") {
		levelOut = "\x1b[1;32minf\x1b[0m";
	} else if (conf.logLevel === "warn") {
		levelOut = "\x1b[1;33mwar\x1b[0m";
	} else if (conf.logLevel === "error") {
		levelOut = "\x1b[1;31merr\x1b[0m";
	} else {
		throw new Error(`Invalid conf.logLevel: "${conf.logLevel}"`);
	}

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

function isFetchError(error: unknown): error is FetchError {
	return typeof error === "object" && error !== null && "message" in error;
}

// Resource-level OTLP attributes (service.name + telemetry.sdk.*), shared by logs and spans.
// Grafana/Loki reads service.name from here, not from the records.
function buildResourceAttributes(context: Metadata): OtlpAttribute[] {
	return [
		{ key: "service.name", value: { stringValue: String(context["service.name"] || "unnamed-service") } },
		{ key: "telemetry.sdk.language", value: { stringValue: "ecmascript" } },
		{ key: "telemetry.sdk.name", value: { stringValue: "@larvit/log" } },
		{ key: "telemetry.sdk.version", value: { stringValue: "__version__" } },
	];
}

// Pure builder: state in, OTLP log payload out. Kept out of the class so it is trivially testable.
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

// Span finalizer: writes the resolved attributes/parent onto the span, then returns the OTLP payload.
// Not pure — it mutates `span` — but kept out of the class so it stays trivially testable.
function buildSpanPayload(opts: {
	context: Metadata,
	parentSpan?: OtlpSpan,
	span: OtlpSpan,
}): OtlpSpanPayload {
	const { context, parentSpan, span } = opts;

	// service.name is carried on the resource scope below, so it is excluded from the span attributes.
	const attributes: OtlpAttribute[] = Object.entries(context)
		.filter(([key]) => key !== "service.name")
		.map(([key, value]) => ({ key, value: { stringValue: String(value) } }));

	if (attributes.length) {
		span.attributes = attributes;
	}

	if (parentSpan && parentSpan.spanId) {
		span.parentSpanId = parentSpan.spanId;
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
							if (span.status.code) spanMsg.message(15, status => status.uint(3, span.status.code)); // status = 15 (Status.code = 3)
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

export class Log implements LogInt {
	context: Metadata;
	ended: boolean = false;

	readonly conf: ResolvedLogConf;

	// In-flight OTLP log exports, awaited by end() so all logs are sent before the trace/span.
	private inFlight = new Set<Promise<unknown>>();

	// Validated + parsed once in the constructor (instead of re-parsing on every log call).
	private otlpBaseUrl?: URL;

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

			for (const key of Object.keys(parentConf) as (keyof LogConf)[]) {
				if (conf[key] === undefined) {
					// Same key on both sides, so the value type matches; `as never` satisfies the writer.
					conf[key] = parentConf[key] as never;
				}
			}
		}

		if (conf.logLevel === undefined) {
			conf.logLevel = "info";
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
		this.context = { ...this.conf.context ?? {} };

		// Validate the endpoint eagerly: a malformed URI fails here, not as an unhandled rejection mid-log.
		if (this.conf.otlpHttpBaseURI) {
			this.otlpBaseUrl = new URL(this.conf.otlpHttpBaseURI);
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
			...conf.context,
		};

		// Inherit every other setting not overridden (log level, sinks, OTLP config, printTraceInfo…),
		// like the constructor does from a parentLog. parentLog/spanName/traceparent are excluded: a
		// clone is its own span, not a child. (A manual allow-list here once dropped newer OTLP options.)
		for (const key of Object.keys(this.conf) as (keyof LogConf)[]) {
			if (key !== "parentLog" && key !== "spanName" && key !== "traceparent" && conf[key] === undefined) {
				conf[key] = this.conf[key] as never;
			}
		}

		return new Log(conf);
	}

	// Ends the span and flushes OTLP. Awaitable: `await log.end()` guarantees delivery before exit.
	// Fire-and-forget (`log.end()`) still works for callers that do not care.
	public async end(): Promise<void> {
		if (this.ended) {
			throw new Error("Logging instance is already ended");
		}
		this.ended = true;
		this.span.endTimeUnixNano = getNsTimestamp(Date.now());

		// All logs must be sent before the trace/span.
		await Promise.all([...this.inFlight]);
		await this.otlpCreateSpan(this.span);
	}

	// The current span's context as a W3C `traceparent` header, for propagating to non-fetch clients.
	public traceparent(): string {
		return formatTraceparent(this.span.traceId, this.span.spanId);
	}

	// Drop-in `fetch`: auto-creates a CLIENT span (nested under this log's span), injects a
	// `traceparent`, records the OTel http.* attributes, and is the only output (no log line). The
	// span exports in the background and is registered with end() at call time, so `await log.end()`
	// delivers it even when the fetch wasn't awaited. Only `string`/`URL` inputs are traced; anything
	// else (a `Request`, or a relative URL with no base) passes through to a plain, untraced fetch.
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
		// delivered by a later await log.end().
		let settle!: () => void;

		this.track(new Promise<void>(resolve => { settle = resolve; }));

		return this.tracedFetch(url, init, settle);
	}

	private async tracedFetch(url: URL, init: RequestInit | undefined, settle: () => void): Promise<Response> {
		// childSpan can't throw; everything that can (e.g. `new Headers` on a bad name) is inside the
		// try, so finally always settles the tracked promise and end() can never hang on this fetch.
		const span = this.childSpan(url.host, 3); // CLIENT; name refined below
		const context: Metadata = { ...this.context };

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
			const cause = err as { code?: string, name?: string };

			span.status.code = 2; // ERROR
			context["error.type"] = cause.code ?? cause.name ?? "fetch_error";

			throw err;
		} finally {
			// Always settle the tracked promise so end() can never hang on this fetch, even if the
			// export call itself throws synchronously (it normally resolves once the span is delivered).
			try {
				void this.exportChildSpan(span, context).then(settle, settle);
			} catch {
				settle();
			}
		}
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

		if (this.shouldSkipLog(logLevel)) return;

		const msTimestamp = Date.now();
		const attributes: Metadata = { ...metadata, ...this.context };

		// Console output, optionally enriched with span/trace info.
		const consoleMetadata: Metadata = { ...attributes };
		if (this.conf.printTraceInfo) {
			consoleMetadata.spanId = this.span.spanId;
			consoleMetadata.traceId = this.span.traceId;
			consoleMetadata.spanName = this.span.name;
		}
		this.outputToConsole(logLevel, msg, consoleMetadata, msTimestamp);

		if (!this.otlpBaseUrl) {
			return;
		}

		// Logs attach to the parent span when there is one, otherwise to this instance's span.
		const span = this.conf.parentLog?.span.spanId ? this.conf.parentLog.span : this.span;
		const payload = buildLogPayload({ attributes, logLevel, msTimestamp, msg, span });

		this.track(this.otlpCall({ path: "/v1/logs", payload }));
	}

	private track(promise: Promise<unknown>): void {
		this.inFlight.add(promise);
		// otlpCall never rejects, but stay defensive so a stray rejection can't become unhandled.
		void promise.catch(() => {}).finally(() => this.inFlight.delete(promise));
	}

	private shouldSkipLog(logLevel: LogLevel): boolean {
		if (this.conf.logLevel === "none") {
			return true;
		}

		// LogLevels.severityNumber is the single source of truth for ordering.
		return LogLevels[logLevel].severityNumber < LogLevels[this.conf.logLevel as LogLevel].severityNumber;
	}

	private outputToConsole(logLevel: LogLevel, msg: string, metadata: Metadata, msTimestamp: number) {
		const output = this.conf.entryFormatter({
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

	private async otlpCall({
		path,
		payload,
	}: {
		path: string,
		payload: OtlpSpanPayload | OtlpLogPayload,
	}): Promise<boolean> {
		if (!this.otlpBaseUrl) {
			return true;
		}

		const base = this.otlpBaseUrl;
		const basePath = base.pathname.replace(/\/$/, ""); // keep any base path prefix, drop a trailing slash
		const url = `${base.protocol}//${base.username ? `${base.username}:${base.password}@` : "" }${base.host}${basePath}${path}`;

		const protobuf = this.conf.otlpProtocol === "http/protobuf";

		const headers: Record<string, string> = {
			"Content-Type": protobuf ? "application/x-protobuf" : "application/json",
		};

		if (this.conf.otlpAdditionalHeaders) {
			Object.assign(headers, this.conf.otlpAdditionalHeaders);
		}

		// AbortController + cleared timer works in browsers and Node, and never leaves a dangling timer.
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), OTLP_EXPORT_TIMEOUT_MS);

		try {
			const res = await fetch(url, {
				body: protobuf ? encodeOtlpProtobuf(payload) : JSON.stringify(payload),
				headers,
				method: "POST",
				signal: controller.signal,
			});

			if (!res.ok) {
				const err = (new Error("Non-ok return status")) as FetchError;

				err.status = res.status;

				throw err;
			}

			// Protobuf responses are binary (usually empty); a 2xx is success. Only the JSON
			// transport inspects the response body.
			if (!protobuf) {
				const resBody = await res.json();

				const resBodyStr = JSON.stringify(resBody);
				if (resBodyStr !== "{\"partialSuccess\":{}}" && resBodyStr !== "{}") {
					throw new Error("Invalid response body from OTLP service. Expected '{\"partialSuccess\":{}}' or '{}' but got: '" + JSON.stringify(resBody) + "'");
				}
			}

			return true;
		} catch (err: unknown) {
			if (isFetchError(err)) {
				this.conf.stderr(this.conf.entryFormatter({
					logLevel: "error",
					metadata: {
						fetchStatus: String(err.status),
						url,
					},
					msg: err.message,
				}));
			} else if (err instanceof Error) {
				this.conf.stderr(this.conf.entryFormatter({
					logLevel: "error",
					metadata: { url },
					msg: err.message,
				}));
			} else {
				this.conf.stderr(this.conf.entryFormatter({
					logLevel: "error",
					metadata: { url },
					msg: "Unknown error sending to OTLP",
				}));
			}

			return false;
		} finally {
			clearTimeout(timer);
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

	// Stamps the end time and exports a child span, deriving its attributes/resource from `context`.
	private exportChildSpan(span: OtlpSpan, context: Metadata): Promise<unknown> {
		span.endTimeUnixNano = getNsTimestamp(Date.now());

		return this.otlpCall({ path: "/v1/traces", payload: buildSpanPayload({ context, span }) });
	}

	private async otlpCreateSpan(span: OtlpSpan): Promise<boolean> {
		const payload = buildSpanPayload({
			context: this.context,
			parentSpan: this.conf.parentLog?.span,
			span,
		});

		return this.otlpCall({ path: "/v1/traces", payload });
	}
}
