import { createRequire } from "module";

const require = createRequire(import.meta.url);
const packageJson = require("./package.json");

export type EntryFormatterConf = {
	logLevel: LogLevel;
	metadata?: Metadata;
	msTimestamp?: number;
	msg: string;
}

export type LogConf = {
	context?: Metadata;
	entryFormatter?: (conf: EntryFormatterConf) => string;
	format?: "text" | "json";
	logLevel?: LogLevel | "none";
	otlpAdditionalHeaders?: Record<string, string>;

	// Ignored until OTLP libraries are stable and can be used in node, web and React Native without issue
	otlpExportTimeoutMillis?: number, // default: 3000, How long to wait for the export to complete

	otlpHttpBaseURI?: string;

	// Ignored until OTLP libraries are stable and can be used in node, web and React Native without issue
	otlpMaxExportBatchSize?: number, // default: 512, Maximum number of spans to batch
	otlpMaxQueueSize?: number, // default: 2048, Maximum queue size (default 2048)
	otlpScheduledDelayMillis?: number, // default: 100, How often to check for spans to send (default 1000ms)

	parentLog?: LogInt;
	printTraceInfo?: boolean;
	spanName?: string;
	stderr?: (msg: string) => void;
	stdout?: (msg: string) => void;
}

export type LogInt = {
	conf: LogConf;
	span: OtlpSpan;
	/* eslint-disable typescript-sort-keys/interface */
	error: LogShorthand;
	warn: LogShorthand;
	info: LogShorthand;
	verbose: LogShorthand;
	debug: LogShorthand;
	silly: LogShorthand;
	end: () => void;
	/* eslint-enable typescript-sort-keys/interface */
}

export type LogLevel = keyof typeof LogLevels;

export type LogShorthand = (msg: string, metadata?: Metadata) => void;

export type Metadata = {
	[key: string]: string;
}

export type OtlpAttribute = {
	key: string,
	value: {
		stringValue: string
	}
}

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
}

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
}

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
}

type FetchError = {
  message: string;
  status?: number;
}

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
		severityNumber: 5,
		severityText: "DEBUG4",
	},
	debug: {
		severityNumber: 6,
		severityText: "DEBUG",
	},
	silly: {
		severityNumber: 1,
		severityText: "TRACE",
	},
	/* eslint-enable sort-keys */
};

export function msgJsonFormatter(conf: EntryFormatterConf) {
	const payload = Object.assign(conf.metadata, {
		logLevel: conf.logLevel,
		msg: conf.msg,
		time: new Date().toISOString(),
	});

	return JSON.stringify(payload);
}

export function msgTextFormatter(conf: EntryFormatterConf) {
	let levelOut = "";

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

	let str = `${new Date().toISOString().substring(0, 19)}Z [${levelOut}] ${conf.msg}`;
	const metadataStr = JSON.stringify(conf.metadata);
	if (metadataStr !== "{}") {
		str += ` ${JSON.stringify(conf.metadata)}`;
	}

	return str;
}

/**
 * Converts a Uint8Array to a hex string.
 *
 * @param {bytes} bytes - The byte array to convert
 *
 * @returns {string} The hex string representation
 */
function bytesToHex(bytes: Uint8Array): string {
	return Array.from(bytes)
		.map(byte => byte.toString(16).padStart(2, "0"))
		.join("");
}

/**
 * Generates a random 8-byte span ID as a 16-character hex string.
 *
 * @returns {string} A valid OTLP span ID
 */
function generateSpanId(): string {
	const bytes = new Uint8Array(8);

	crypto.getRandomValues(bytes);

	return bytesToHex(bytes);
}

/**
 * Generates a random 16-byte trace ID as a 32-character hex string.
 *
 * @returns {string} A valid OTLP trace ID
 */
function generateTraceId(): string {
	const bytes = new Uint8Array(16);

	crypto.getRandomValues(bytes);

	// Ensure version 1 trace ID by setting first byte
	bytes[0] = 0x01;

	return bytesToHex(bytes);
}

// msTimestamp should be generated from Date.now()
function getNsTimestamp(msTimestamp: number): string {
	// Convert to nanoseconds (multiply by 1,000,000 to convert ms to ns)
	const seconds = Math.floor(msTimestamp / 1000);
	const nanos = (msTimestamp % 1000) * 1000000;

	// Use BigInt to handle the full nanosecond precision
	const secondsBigInt = BigInt(seconds);
	const nanosBigInt = BigInt(Math.floor(nanos));

	// Convert to nanoseconds (seconds * 10^9 + remaining nanos)
	const totalNanos = (secondsBigInt * BigInt(1000000000)) + nanosBigInt;

	return totalNanos.toString();
}

function isFetchError(error: unknown): error is FetchError {
	return typeof error === "object" && error !== null && "message" in error;
}

export class Log implements LogInt {
	context: Metadata;
	ended: boolean = false;

	readonly conf: LogConf;

	// An array of successfully sent logs
	// We track this so all logs are sent before we send the trace data at the end
	// No idea why this is needed, but this is how the official SDK works, so this
	// is to replicate that.
	private otlpLogsSent: boolean[] = [];

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
		this.context = this.conf.context || {};

		// const traceExporter = new OTLPTraceExporter({
		// headers: this.conf.otlpAdditionalHeaders,
		// url: this.conf.otlpHttpBaseURI ? `${this.conf.otlpHttpBaseURI}/v1/traces` : undefined,
		// });

		// const logExporter = new OTLPLogExporter({
		// headers: this.conf.otlpAdditionalHeaders,
		// url: this.conf.otlpHttpBaseURI ? `${this.conf.otlpHttpBaseURI}/v1/logs` : undefined,
		// });

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

		if (this.conf.format !== "json" && conf.format === "json") {
			conf.entryFormatter = msgJsonFormatter;
		} else {
			conf.entryFormatter = this.conf.entryFormatter;
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

	public end() {
		if (this.ended) {
			throw new Error("Logging instance is already ended");
		}
		this.ended = true;
		this.span.endTimeUnixNano = getNsTimestamp(Date.now());
		this.otlpCreateSpan(this.span);
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

		const formattedMetadata = { ...metadata, ...this.context };
		const msTimestamp = Date.now();

		// Console output
		this.outputToConsole(logLevel, msg, formattedMetadata, msTimestamp);

		if (!this.conf.otlpHttpBaseURI) {
			return;
		}

		const payload: OtlpLogPayload = {
			resourceLogs: [{
				resource: { attributes: [] },
				scopeLogs: [{
					logRecords: [{
						body: { stringValue: msg },
						severityNumber: LogLevels[logLevel].severityNumber,
						severityText: LogLevels[logLevel].severityText,
						spanId: this.span.spanId,
						timeUnixNano: String(getNsTimestamp(Date.now())),
						traceId: this.span.traceId,
					}],
				}],
			}],
		};

		if (this.conf.parentLog && this.conf.parentLog.span.spanId) {
			payload.resourceLogs[0].scopeLogs[0].logRecords[0].spanId = this.conf.parentLog.span.spanId;
			payload.resourceLogs[0].scopeLogs[0].logRecords[0].traceId = this.conf.parentLog.span.traceId;
		}

		const attributes = { ...metadata, ...this.context };

		if (attributes && Object.keys(attributes).length) {
			payload.resourceLogs[0].scopeLogs[0].logRecords[0].attributes = [];

			for (const [key, value] of Object.entries(attributes)) {
				payload.resourceLogs[0].scopeLogs[0].logRecords[0].attributes.push({
					key,
					value: { stringValue: value },
				});
			}
		}

		const logIdx = this.otlpLogsSent.push(false) - 1;

		this.otlpCall({ logIdx, path: "/v1/logs", payload });
	}

	private shouldSkipLog(logLevel: LogLevel): boolean {
		const levels: LogLevel[] = ["error", "warn", "info", "verbose", "debug", "silly"];
		const currentLevelIndex = levels.indexOf(this.conf.logLevel as LogLevel);
		const msgLevelIndex = levels.indexOf(logLevel);

		return currentLevelIndex < msgLevelIndex || this.conf.logLevel === "none";
	}

	private outputToConsole(logLevel: LogLevel, msg: string, metadata: Metadata, msTimestamp: number) {
		const output = this.conf.entryFormatter!({
			logLevel,
			metadata,
			msTimestamp,
			msg,
		});

		if (["error", "warn"].includes(logLevel)) {
			this.conf.stderr!(output);
		} else {
			this.conf.stdout!(output);
		}
	}

	private async otlpCall({
		logIdx,
		path,
		payload,
	}: {
		logIdx?: number,
		path: string,
		payload: OtlpSpanPayload | OtlpLogPayload,
	}): Promise<boolean> {
		if (!this.conf.otlpHttpBaseURI) {
			return true;
		}

		const urlObj = new URL(this.conf.otlpHttpBaseURI);
		const url = `${urlObj.protocol}//${urlObj.username ? `${urlObj.username}:${urlObj.password}@` : "" }${urlObj.host}${path}`;

		const headers = {
			"Content-Type": "application/json",
		};

		if (this.conf.otlpAdditionalHeaders) {
			Object.assign(headers, this.conf.otlpAdditionalHeaders);
		}

		try {
			const res = await fetch(url, {
				body: JSON.stringify(payload),
				headers,
				method: "POST",
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
			if (logIdx !== undefined) {
				this.otlpLogsSent[logIdx] = true;
			}
		}
	}

	private async otlpCreateSpan(span: OtlpSpan): Promise<boolean> {
		const payload: OtlpSpanPayload = {
			resourceSpans: [{
				resource: {
					attributes: [
						{
							key: "service.name",
							value: {
								stringValue: this.context["service.name"] || "unnamed-service",
							},
						},
						{
							key: "telemetry.sdk.language",
							value: {
								stringValue: "ecmascript",
							},
						},
						{
							key: "telemetry.sdk.name",
							value: {
								stringValue: "@larvit/log",
							},
						},
						{
							key: "telemetry.sdk.version",
							value: {
								stringValue: packageJson.version,
							},
						},
					],
					droppedAttributesCount: 0,
				},
				scopeSpans: [{
					scope: {
						name: span.name,
					},
					spans: [span],
				}],
			}],
		};

		// Add context as attributes
		if (Object.keys(this.context).length > 0) {
			payload.resourceSpans[0].scopeSpans[0].spans[0].attributes = [];

			for (const [key, value] of Object.entries(this.context)) {
				if (key !== "service.name") { // service.name is already added to the span scope if it is set.
					payload.resourceSpans[0].scopeSpans[0].spans[0].attributes.push({
						key,
						value: {
							stringValue: String(value),
						},
					});
				}
			}
		}

		if (this.conf.parentLog && this.conf.parentLog.span.spanId) {
			payload.resourceSpans[0].scopeSpans[0].spans[0].parentSpanId = this.conf.parentLog.span.spanId;
		}

		while (!this.otlpLogsSent.every(Boolean)) {
			await new Promise(resolve => setTimeout(resolve, 10));
		}

		return this.otlpCall({ path: "/v1/traces", payload });
	}
}
