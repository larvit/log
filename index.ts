import { Attributes, context, Span, SpanKind, trace, TraceFlags } from "@opentelemetry/api";
import { Logger, SeverityNumber } from "@opentelemetry/api-logs";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { Resource } from "@opentelemetry/resources";
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { LoggerProvider } from "@opentelemetry/sdk-logs";
import { BatchSpanProcessor, Tracer } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";

export type Metadata = {
	[key: string]: string;
}

export type LogShorthand = (msg: string, metadata?: Metadata) => void;

export type LogInt = {
	conf: LogConf;
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
		severityNumber: SeverityNumber.ERROR,
		severityText: "ERROR",
	},
	warn: {
		severityNumber: SeverityNumber.WARN,
		severityText: "WARN",
	},
	info: {
		severityNumber: SeverityNumber.INFO,
		severityText: "INFO",
	},
	verbose: {
		severityNumber: SeverityNumber.DEBUG,
		severityText: "DEBUG4",
	},
	debug: {
		severityNumber: SeverityNumber.DEBUG2,
		severityText: "DEBUG",
	},
	silly: {
		severityNumber: SeverityNumber.TRACE,
		severityText: "TRACE",
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
	otlpAdditionalHeaders?: Record<string, string>;
	otlpExportTimeoutMillis?: number, // default: 3000, How long to wait for the export to complete
	otlpHttpBaseURI?: string;
	otlpMaxExportBatchSize?: number, // default: 512, Maximum number of spans to batch
	otlpMaxQueueSize?: number, // default: 2048, Maximum queue size (default 2048)
	otlpScheduledDelayMillis?: number, // default: 100, How often to check for spans to send (default 1000ms)
	parentLog?: LogInt;
	printTraceInfo?: boolean;
	spanName?: string;
	stderr?: (msg: string) => void;
	stdout?: (msg: string) => void;
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

export class Log implements LogInt {
	private readonly otlpTracer: Tracer;
	private readonly otlpLogger: Logger;
	private currentSpan: Span | null = null;
	private readonly otlpLoggerProvider: LoggerProvider;

	context: Metadata;
	readonly conf: LogConf;
	spanId: string;
	traceId: string;

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

		// Setup OpenTelemetry
		const otlpResource = new Resource({
			"service.name": "larvit-log",
			...this.context,
		});

		const traceExporter = new OTLPTraceExporter({
			headers: this.conf.otlpAdditionalHeaders,
			url: this.conf.otlpHttpBaseURI ? `${this.conf.otlpHttpBaseURI}/v1/traces` : undefined,
		});

		const logExporter = new OTLPLogExporter({
			headers: this.conf.otlpAdditionalHeaders,
			url: this.conf.otlpHttpBaseURI ? `${this.conf.otlpHttpBaseURI}/v1/logs` : undefined,
		});

		this.otlpLoggerProvider = new LoggerProvider({ resource: otlpResource });
		this.otlpLoggerProvider.addLogRecordProcessor(new BatchLogRecordProcessor(logExporter, {
			exportTimeoutMillis: this.conf.otlpExportTimeoutMillis !== undefined ? this.conf.otlpExportTimeoutMillis : 3000,
			maxExportBatchSize: this.conf.otlpMaxExportBatchSize !== undefined ? this.conf.otlpMaxExportBatchSize : 512,
			maxQueueSize: this.conf.otlpMaxQueueSize !== undefined ? this.conf.otlpMaxQueueSize : 2048,
			scheduledDelayMillis: this.conf.otlpScheduledDelayMillis !== undefined ? this.conf.otlpScheduledDelayMillis : 100,
		}));
		this.otlpLogger = this.otlpLoggerProvider.getLogger("larvit-log");

		// Initialize tracer
		const tracerProvider = new NodeTracerProvider({
			resource: otlpResource,
			spanProcessors: [new BatchSpanProcessor(traceExporter, {
				exportTimeoutMillis: this.conf.otlpExportTimeoutMillis !== undefined ? this.conf.otlpExportTimeoutMillis : 3000,
				maxExportBatchSize: this.conf.otlpMaxExportBatchSize !== undefined ? this.conf.otlpMaxExportBatchSize : 512,
				maxQueueSize: this.conf.otlpMaxQueueSize !== undefined ? this.conf.otlpMaxQueueSize : 2048,
				scheduledDelayMillis: this.conf.otlpScheduledDelayMillis !== undefined ? this.conf.otlpScheduledDelayMillis : 100,
			})],
		});

		tracerProvider.register();
		this.otlpTracer = tracerProvider.getTracer("larvit-log");

		// Create and activate the span
		const activeContext = context.active();

		this.currentSpan = this.otlpTracer.startSpan(
			this.conf.spanName || "unnamed-span",
			{ kind: SpanKind.INTERNAL },
			activeContext,
		);

		// Store the IDs
		this.spanId = this.currentSpan.spanContext().spanId;
		this.traceId = this.currentSpan.spanContext().traceId;

		if (this.conf.parentLog) {
			const parentContext = trace.setSpanContext(context.active(), {
				isRemote: false,
				spanId: this.conf.parentLog.spanId,
				traceFlags: TraceFlags.SAMPLED,
				traceId: this.conf.parentLog.traceId,
			});

			trace.setSpan(parentContext, this.currentSpan!);
		}
	}

	private log(logLevel: LogLevel, msg: string, metadata?: Metadata): void {
		if (this.shouldSkipLog(logLevel)) return;

		const formattedMetadata = { ...metadata, ...this.context };
		const msTimestamp = Date.now();

		// Console output
		this.outputToConsole(logLevel, msg, formattedMetadata, msTimestamp);

		// Create a context with the current span
		if (this.currentSpan) {
			const ctx = trace.setSpan(context.active(), this.currentSpan);

			// Emit the log with the span context
			context.with(ctx, () => {
				this.otlpLogger.emit({
					attributes: formattedMetadata as Attributes,
					body: msg,
					severityNumber: LogLevels[logLevel].severityNumber,
					severityText: LogLevels[logLevel].severityText,
				});
			});
		} else {
			// Fallback if no span is available
			this.otlpLogger.emit({
				attributes: formattedMetadata as Attributes,
				body: msg,
				severityNumber: LogLevels[logLevel].severityNumber,
				severityText: LogLevels[logLevel].severityText,
			});
		}
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

	public error(msg: string, metadata?: Metadata) { this.log("error", msg, metadata); }
	public warn(msg: string, metadata?: Metadata) { this.log("warn", msg, metadata); }
	public info(msg: string, metadata?: Metadata) { this.log("info", msg, metadata); }
	public verbose(msg: string, metadata?: Metadata) { this.log("verbose", msg, metadata); }
	public debug(msg: string, metadata?: Metadata) { this.log("debug", msg, metadata); }
	public silly(msg: string, metadata?: Metadata) { this.log("silly", msg, metadata); }

	public end() {
		if (this.currentSpan) {
			this.currentSpan.end();
		}
		this.otlpLoggerProvider.shutdown();
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
}
