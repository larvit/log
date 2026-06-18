export type EntryFormatterConf = {
	logLevel: LogLevel;
	metadata?: Metadata;
	msg: string;
	msTimestamp?: number;
};

export type LogConf = {
	context?: Metadata;
	entryFormatter?: (conf: EntryFormatterConf) => string;
	format?: "text" | "json";
	logLevel?: LogLevel | "none";
	otlpAdditionalHeaders?: Record<string, string>;
	otlpHttpBaseURI?: string;
	parentLog?: LogInt;
	printTraceInfo?: boolean;
	spanName?: string;
	stderr?: (msg: string) => void;
	stdout?: (msg: string) => void;
};

export type LogInt = {
	conf: LogConf;
	span: OtlpSpan;
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

/**
 * Generates a random 8-byte span ID as a 16-character hex string.
 *
 * @returns {string} A valid OTLP span ID
 */
export function generateSpanId(): string {
	return bytesToHex(getRandomBytes(8));
}

/**
 * Generates a random 16-byte trace ID as a 32-character hex string.
 *
 * @returns {string} A valid OTLP trace ID
 */
export function generateTraceId(): string {
	const bytes = getRandomBytes(16);

	// Ensure version 1 trace ID by setting first byte
	bytes[0] = 0x01;

	return bytesToHex(bytes);
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

// Resource-level OTLP attributes (service.name + telemetry.sdk.*). Shared by logs and spans so the
// service is identified the same way for both — Grafana/Loki reads service.name from here, not the records.
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

// Pure builder: state in, OTLP span payload out. Mutates the passed span with its resolved attributes/parent.
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

export class Log implements LogInt {
	context: Metadata;
	ended: boolean = false;

	readonly conf: LogConf;

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
			for (const [key, value] of Object.entries(conf.parentLog.conf)) {
				if (conf[key] === undefined) {
					conf[key] = value;
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

		this.conf = conf;
		// Own copy, so a clone/child never mutates a context object shared with another instance.
		this.context = { ...this.conf.context ?? {} };

		// Validate the endpoint eagerly: a malformed URI fails here, not as an unhandled rejection mid-log.
		if (this.conf.otlpHttpBaseURI) {
			this.otlpBaseUrl = new URL(this.conf.otlpHttpBaseURI);
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
			parentSpanId: this.conf.parentLog?.span.spanId,
			spanId: generateSpanId(),
			startTimeUnixNano: getNsTimestamp(Date.now()),
			status: { code: 0 },
			traceId: this.conf.parentLog?.span.traceId || generateTraceId(),
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

		if (conf.logLevel === undefined) {
			conf.logLevel = this.conf.logLevel;
		}

		// Resolve the formatter from the effective format, so json<->text can be changed in either direction.
		if (conf.entryFormatter === undefined) {
			if (conf.format === "json") {
				conf.entryFormatter = msgJsonFormatter;
			} else if (conf.format === "text") {
				conf.entryFormatter = msgTextFormatter;
			} else {
				conf.entryFormatter = this.conf.entryFormatter;
			}
		}

		if (conf.stderr === undefined) {
			conf.stderr = this.conf.stderr;
		}

		if (conf.stdout === undefined) {
			conf.stdout = this.conf.stdout;
		}

		conf.context = {
			...this.context,
			...conf.context,
		};

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

		const headers = {
			"Content-Type": "application/json",
		};

		if (this.conf.otlpAdditionalHeaders) {
			Object.assign(headers, this.conf.otlpAdditionalHeaders);
		}

		// AbortController + cleared timer works in browsers and Node, and never leaves a dangling timer.
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), OTLP_EXPORT_TIMEOUT_MS);

		try {
			const res = await fetch(url, {
				body: JSON.stringify(payload),
				headers,
				method: "POST",
				signal: controller.signal,
			});

			if (!res.ok) {
				const err = (new Error("Non-ok return status")) as FetchError;

				err.status = res.status;

				throw err;
			}

			const resBody = await res.json();

			const resBodyStr = JSON.stringify(resBody);
			if (resBodyStr !== "{\"partialSuccess\":{}}" && resBodyStr !== "{}") {
				throw new Error("Invalid response body from OTLP service. Expected '{\"partialSuccess\":{}}' or '{}' but got: '" + JSON.stringify(resBody) + "'");
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

	private async otlpCreateSpan(span: OtlpSpan): Promise<boolean> {
		const payload = buildSpanPayload({
			context: this.context,
			parentSpan: this.conf.parentLog?.span,
			span,
		});

		return this.otlpCall({ path: "/v1/traces", payload });
	}
}
