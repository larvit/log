export type Metadata = {
	[key: string]: string;
}

export type LogShorthand = (msg: string, metadata?: Metadata) => void;

export interface LogInt {
	spanId: string;
	traceId: string;
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

export const LogLevels = {
	/* eslint-disable sort-keys */
	error: {
		otlpSeverityNumber: 17,
		otlpSeverityText: "ERROR",
	},
	warn: {
		otlpSeverityNumber: 13,
		otlpSeverityText: "WARN",
	},
	info: {
		otlpSeverityNumber: 9,
		otlpSeverityText: "INFO",
	},
	verbose: {
		otlpSeverityNumber: 8,
		otlpSeverityText: "DEBUG4",
	},
	debug: {
		otlpSeverityNumber: 5,
		otlpSeverityText: "DEBUG",
	},
	silly: {
		otlpSeverityNumber: 3,
		otlpSeverityText: "TRACE",
	},
	/* eslint-enable sort-keys */
};

export type LogLevel = keyof typeof LogLevels;

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
	otlpHttpBaseURI?: string;
	parentLog?: LogInt;
	printTraceInfo?: boolean;
	spanName?: string;
	stderr?: (msg: string) => void;
	stdout?: (msg: string) => void;
}

export type OtlpAttribute = {
	key: string,
	value: {
		stringValue: string
	}
}

export type OtlpSpanPayload = {
	resourceSpans: {
		resource: {
			attributes: OtlpAttribute[],
		},
		scopeSpans: {
			spans: {
				attributes?: OtlpAttribute[],
				endTimeUnixNano: string,
				kind: 0 | 1 | 2 | 3 | 4 | 5,
				name: string,
				parentSpanId?: string,
				spanId: string,
				startTimeUnixNano: string,
				traceId: string,
			}[],
		}[],
	}[],
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

type FetchError = {
  message: string;
  status?: number;
}

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

function generateSpanId(): string {
	const bytes = new Uint8Array(8);

	crypto.getRandomValues(bytes);
	bytes[0] |= 1; // Ensure at least one non-zero byte

	return Array.from(bytes)
		.map(internalBytes => internalBytes.toString(16).padStart(2, "0"))
		.join("");
}

function generateTraceId(): string {
	const bytes = new Uint8Array(16);

	crypto.getRandomValues(bytes);
	bytes[0] |= 1; // Ensure at least one non-zero byte

	return Array.from(bytes)
		.map(internalBytes => internalBytes.toString(16).padStart(2, "0"))
		.join("");
}

// msTimestamp should be generated from Date.now()
function getNsTimestamp(msTimestamp: number): number {
	// Convert to nanoseconds (multiply by 1,000,000 to convert ms to ns)
	const nanoseconds = msTimestamp * 1000000;

	// Add sub-millisecond precision using performance.now()
	// Note: This provides microsecond precision on most systems
	const fractionalNanoseconds = Math.floor((performance.now() % 1) * 1000000);

	return nanoseconds + fractionalNanoseconds;
}

function isFetchError(error: unknown): error is FetchError {
	return typeof error === "object" && error !== null && "message" in error;
}

export class Log implements LogInt {
	context: Metadata;
	readonly #conf: LogConf; // Saved to be able to recreate instance
	readonly #entryFormatter: (conf: EntryFormatterConf) => string;
	readonly #logLevel: LogLevel | "none";
	readonly #otlpHttpBaseURI: string;
	readonly #parentLog: LogInt | null;
	readonly #printTraceInfo: boolean;
	readonly #spanName: string;
	readonly #stderr: (msg: string) => void;
	readonly #stdout: (msg: string) => void;
	readonly traceId: string;
	readonly spanId: string;
	#otlpSpanPayload: OtlpSpanPayload;

	constructor(conf?: LogConf | LogLevel | "none") {
		if (conf === undefined) {
			conf = {};
		} else if (typeof conf === "string") {
			conf = { logLevel: conf };
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

		this.#conf = conf;
		this.#entryFormatter = conf.entryFormatter;
		this.#logLevel = conf.logLevel;
		this.#otlpHttpBaseURI = conf.otlpHttpBaseURI;
		this.#parentLog = typeof conf.parentLog === "object" ? conf.parentLog : null;
		this.#printTraceInfo = conf.printTraceInfo === true ? true : false;
		this.#stderr = conf.stderr;
		this.#stdout = conf.stdout;
		this.context = conf.context || {};
		this.spanId = generateSpanId();
		this.traceId = generateTraceId();

		this.#spanName = conf.spanName || this.spanId;

		this.otlpCreateSpan();
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
			conf.logLevel = this.#logLevel;
		}

		if (this.#conf.format !== "json" && conf.format === "json") {
			conf.entryFormatter = msgJsonFormatter;
		} else {
			conf.entryFormatter = this.#entryFormatter;
		}

		if (conf.stderr === undefined) {
			conf.stderr = this.#conf.stderr;
		}

		if (conf.stdout === undefined) {
			conf.stdout = this.#conf.stdout;
		}

		conf.context = {
			...this.context,
			...conf.context,
		};

		return new Log(conf);
	}

	public error(msg: string, metadata?: Metadata) {
		if (this.#logLevel === "none") return;
		this.#stderr(this.#entryFormatter({ logLevel: "error", metadata: Object.assign(metadata || {}, this.context), msg }));
	}

	public warn(msg: string, metadata?: Metadata) {
		if (["none", "error"].includes(this.#logLevel)) return;
		this.log("warn", msg, metadata);
	}

	public info(msg: string, metadata?: Metadata) {
		if (["none", "error", "warn"].includes(this.#logLevel)) return;
		this.log("info", msg, metadata);
	}

	public verbose(msg: string, metadata?: Metadata) {
		if (["none", "error", "warn", "info"].includes(this.#logLevel)) return;
		this.log("verbose", msg, metadata);
	}

	public debug(msg: string, metadata?: Metadata) {
		if (["none", "error", "warn", "info", "verbose"].includes(this.#logLevel)) return;
		this.log("debug", msg, metadata);
	}

	public silly(msg: string, metadata?: Metadata) {
		if (["none", "error", "warn", "info", "verbose", "debug"].includes(this.#logLevel)) return;
		this.log("silly", msg, metadata);
	}

	public end() {
		this.#otlpSpanPayload.resourceSpans[0].scopeSpans[0].spans[0].endTimeUnixNano = String(getNsTimestamp(Date.now()));

		this.otlpCall({ path: "/v1/traces", payload: this.#otlpSpanPayload });
	}

	private log(logLevel: LogLevel, msg: string, metadata?: Metadata): void {
		const formattedMetadata = Object.assign(metadata || {}, this.context);
		const msTimestamp = Date.now();

		if (this.#printTraceInfo) {
			Object.assign(metadata, { spanId: this.spanId, traceId: this.traceId });
		}

		if (["error", "warn"].includes(logLevel)) {
			this.#stderr(this.#entryFormatter({ logLevel, metadata: formattedMetadata, msTimestamp, msg }));
		} else {
			this.#stdout(this.#entryFormatter({ logLevel, metadata: formattedMetadata, msTimestamp, msg }));
		}

		if (!this.#otlpHttpBaseURI) {
			return;
		}

		const payload: OtlpLogPayload = {
			resourceLogs: [{
				resource: { attributes: [] },
				scopeLogs: [{
					logRecords: [{
						body: { stringValue: msg },
						severityNumber: LogLevels[logLevel].otlpSeverityNumber,
						severityText: LogLevels[logLevel].otlpSeverityText,
						timeUnixNano: String(getNsTimestamp(Date.now())),
					}],
				}],
			}],
		};

		if (this.#parentLog !== null && this.#parentLog.spanId) {
			payload.resourceLogs[0].scopeLogs[0].logRecords[0].spanId = this.#parentLog.spanId;
			payload.resourceLogs[0].scopeLogs[0].logRecords[0].traceId = this.#parentLog.traceId;
		}

		if (metadata && Object.keys(metadata).length) {
			payload.resourceLogs[0].scopeLogs[0].logRecords[0].attributes = [];

			for (const [key, value] of Object.entries(metadata)) {
				payload.resourceLogs[0].scopeLogs[0].logRecords[0].attributes.push({
					key,
					value: { stringValue: value },
				});
			}
		}

		this.otlpCall({ path: "/v1/logs", payload });
	}

	private async otlpCall({
		path,
		payload,
	}: {
		path: string,
		payload: OtlpSpanPayload | OtlpLogPayload,
	}): Promise<boolean> {
		if (!this.#otlpHttpBaseURI) {
			return true;
		}

		const urlObj = new URL(this.#otlpHttpBaseURI);
		const url = `${urlObj.protocol}//${urlObj.host}${path}`;

		try {
			const res = await fetch(url, {
				body: JSON.stringify(payload),
				headers: {
					"Content-Type": "application/json",
				},
				method: "POST",
			});

			if (!res.ok) {
				const err = (new Error("Non-ok return status")) as FetchError;

				err.status = res.status;

				throw err;
			}

			return true;
		} catch (err: unknown) {
			if (isFetchError(err)) {
				this.#stderr(this.#entryFormatter({
					logLevel: "error",
					metadata: {
						fetchStatus: String(err.status),
						url,
					},
					msg: err.message,
				}));
			} else if (err instanceof Error) {
				this.#stderr(this.#entryFormatter({
					logLevel: "error",
					metadata: { url },
					msg: err.message,
				}));
			} else {
				this.#stderr(this.#entryFormatter({
					logLevel: "error",
					metadata: { url },
					msg: "Unknown error sending to OTLP",
				}));
			}

			return false;
		}
	}

	private async otlpCreateSpan(): Promise<boolean> {
		const msTimestamp = Date.now();
		const nsTimestamp = getNsTimestamp(msTimestamp);

		this.#otlpSpanPayload = {
			resourceSpans: [{
				resource: { attributes: [] },
				scopeSpans: [{
					spans: [{
						endTimeUnixNano: String(nsTimestamp),
						kind: 0,
						name: this.#spanName,
						spanId: this.spanId,
						startTimeUnixNano: String(nsTimestamp),
						traceId: this.traceId,
					}],
				}],
			}],
		};

		// Add context as attributes
		if (Object.keys(this.context).length > 0) {
			this.#otlpSpanPayload.resourceSpans[0].scopeSpans[0].spans[0].attributes = [];

			for (const [key, value] of Object.entries(this.context)) {
				this.#otlpSpanPayload.resourceSpans[0].scopeSpans[0].spans[0].attributes.push({
					key,
					value: {
						stringValue: String(value),
					},
				});
			}
		}

		if (this.#parentLog !== null && this.#parentLog.spanId) {
			this.#otlpSpanPayload.resourceSpans[0].scopeSpans[0].spans[0].parentSpanId = this.#parentLog.spanId;
		}

		return this.otlpCall({ path: "/v1/traces", payload: this.#otlpSpanPayload });
	}
}
