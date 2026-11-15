import { buildLogPayload, buildSpanPayload, type OtlpSpan } from "../otlp/payloads.js";
import { DEFAULT_LOG_LEVEL, type LogLevel, LogLevels, SEVERITY_NUMBERS } from "../primitives/levels.js";
import { endErrorType, exportSpan, openSpan, spanEnd, type SpanHost } from "../tracing/spans.js";
import { type FetchTrace, traceFetch } from "../tracing/fetch.js";
import { formatTraceparent } from "../tracing/traceparent.js";
import type { LogInt, LogOptions, ResolvedLogConf } from "./types.js";
import { type Metadata, type MetadataInput, withoutUndefined } from "../primitives/metadata.js";
import { resolveConf } from "./conf.js";
import type { Transport } from "../tracing/transport.js";
import { warnOnceToStderr, writeStderr } from "./stderr-lines.js";
import { withTraceInfo, writeConsoleEntry } from "./console-output.js";
import { writeOnce } from "../primitives/once-per-sink.js";

// A configured logLevel that is not a level, as the warning about it prints it.
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

export class Log implements LogInt {
	context: Metadata;
	ended: boolean = false;

	readonly conf: ResolvedLogConf;

	// The default list, built at first use: what the conf's own console and otlp* options make.
	private defaultTransports?: readonly Transport[];

	// Un-awaited log.fetch calls, awaited by flush() so their spans are queued before the queue flushes.
	private pendingFetches = new Set<Promise<unknown>>();

	// W3C sampled flag; false exports no spans and propagates 00.
	readonly sampled: boolean;

	span: OtlpSpan;

	/**
	 * @param cloneOf Not part of the API, so leave it out: `clone()` passes the Log it clones.
	 */
	constructor(options?: LogOptions | LogLevel | "none", cloneOf?: Log) {
		const { conf, warnings } = resolveConf(options, cloneOf);

		// clone() warns about its own string form.
		if (typeof options === "string" && !cloneOf) {
			warnings.unshift("@larvit/log: new Log(\"level\") is deprecated and removed in 3.0.0, use new Log({ logLevel })");
		}

		this.conf = conf;
		// Own copy, so a clone/child never mutates a context object shared with another instance.
		this.context = withoutUndefined(conf.context);

		for (const msg of warnings) {
			warnOnceToStderr(conf, this.context, msg);
		}

		const { sampled, span } = openSpan(conf);

		this.sampled = sampled;
		this.span = span;
	}

	public clone(options?: LogOptions | LogLevel | "none") {
		if (typeof options === "string") {
			warnOnceToStderr(this.conf, this.context, "@larvit/log: log.clone(\"level\") is deprecated and removed in 3.0.0, use log.clone({ logLevel })");
		}

		return new Log(options, this);
	}

	public async end(options?: { error?: unknown }): Promise<void> {
		this.throwIfEnded();
		this.ended = true;

		// What is already queued is delivered even when the span's own close throws.
		try {
			const error = options?.error;
			const end = spanEnd(this.spanHost(), { ...this.context }, error === undefined || error === null ? undefined : {
				error,
				errorType: endErrorType(error),
			});

			// The one writer of `this.span` after the constructor. It writes onto the object, never
			// replacing it: README documents `log.span` as an instance field, so a reference taken before
			// end() must see what end() sets: the end time, status and attributes.
			Object.assign(this.span, end.fields);
			exportSpan(this.spanHost(), this.span, end.attributes);
		} finally {
			await this.flush();
		}
	}

	public async flush(): Promise<void> {
		await Promise.all([...this.pendingFetches]);
		await Promise.all(this.transports().map(transport => transport.flush?.()));
	}

	public traceparent(): string {
		return formatTraceparent(this.span.traceId, this.span.spanId, this.sampled);
	}

	public fetch(input: string | URL, init?: RequestInit): Promise<Response> {
		this.throwIfEnded();

		return traceFetch(this.fetchTrace(), input, init, spanQueued => { this.track(spanQueued); });
	}

	// Never writes, so a library author's `if (log.enabled(...))` emits no line; log() warns of an unknown logLevel.
	public enabled(logLevel: LogLevel): boolean {
		if (this.conf.logLevel === "none") {
			return false;
		}

		const threshold = SEVERITY_NUMBERS.get(this.conf.logLevel) ?? LogLevels[DEFAULT_LOG_LEVEL].severityNumber;

		return (SEVERITY_NUMBERS.get(logLevel) ?? -Infinity) >= threshold;
	}

	public error(msg: string, metadata?: MetadataInput) { this.log("error", msg, metadata); }
	public warn(msg: string, metadata?: MetadataInput) { this.log("warn", msg, metadata); }
	public info(msg: string, metadata?: MetadataInput) { this.log("info", msg, metadata); }
	public verbose(msg: string, metadata?: MetadataInput) { this.log("verbose", msg, metadata); }
	public debug(msg: string, metadata?: MetadataInput) { this.log("debug", msg, metadata); }
	public silly(msg: string, metadata?: MetadataInput) { this.log("silly", msg, metadata); }

	private warnOfUnknownLogLevel(): void {
		const configured = this.conf.logLevel;

		if (configured === "none" || SEVERITY_NUMBERS.has(configured)) {
			return;
		}

		// Keyed on the raw value, so only the first call per sink and value builds the message.
		writeOnce(this.conf.stderr, configured, () => {
			writeStderr(this.conf, "warn", undefined, `@larvit/log: logLevel ${describeLogLevel(configured)} is not a level, logging at "${DEFAULT_LOG_LEVEL}"; use error, warn, info, verbose, debug, silly or none`);
		});
	}

	private throwIfEnded(): void {
		if (this.ended) {
			throw new Error("Logging instance is already ended");
		}
	}

	private log(logLevel: LogLevel, msg: string, metadata?: MetadataInput): void {
		this.throwIfEnded();

		this.warnOfUnknownLogLevel();

		if (!this.enabled(logLevel)) return;

		// An entry belongs to the parent's span where there is one.
		const span = this.conf.parentLog?.span.spanId ? this.conf.parentLog.span : this.span;
		const entry = {
			logLevel,
			metadata: Object.assign(withoutUndefined(metadata), this.context),
			msTimestamp: this.conf.clock.now(),
			msg,
			spanId: span.spanId,
			spanName: span.name,
			traceId: span.traceId,
		};

		for (const transport of this.transports()) {
			transport.entry?.(entry);
		}
	}

	// The list this Log hands entries and spans to: `transports`, or else the default list. The default
	// list reads the conf at each record, so a write to `log.conf.format` or `log.conf.otlpQueue` takes
	// effect from the next one, as 2.x documents.
	private transports(): readonly Transport[] {
		return this.conf.transports ?? (this.defaultTransports ??= [
			{
				entry: ({ logLevel, metadata, msg, msTimestamp }) => {
					// 2.x prints the instance's own span, also where the entry is exported under its parent's.
					const { name, spanId, traceId } = this.span;

					writeConsoleEntry(this.conf, logLevel, msg, this.conf.printTraceInfo ? withTraceInfo(metadata, { spanId, spanName: name, traceId }) : metadata, msTimestamp);
				},
			},
			{
				entry: ({ logLevel, metadata, msg, msTimestamp, spanId, traceId }) => {
					this.conf.otlpQueue?.enqueue(buildLogPayload({ attributes: metadata, logLevel, msTimestamp, msg, span: { spanId, traceId } }));
				},
				flush: async () => { await this.conf.otlpQueue?.flush(); },
				span: span => { this.conf.otlpQueue?.enqueue(buildSpanPayload(span)); },
			},
		]);
	}

	private spanHost(): SpanHost {
		return { clock: this.conf.clock, randomBytes: this.conf.randomBytes, sampled: this.sampled, span: this.span, transports: this.transports() };
	}

	private fetchTrace(): FetchTrace {
		const { captureQuery, captureRequestHeaders, captureResponseHeaders } = this.conf;

		return {
			...this.spanHost(),
			captureQuery,
			captureRequestHeaders,
			captureResponseHeaders,
			context: this.context,
			// Read at the call, so a fetch polyfill installed after this Log was made still wins.
			fetch: (...args) => globalThis.fetch(...args),
			warn: msg => warnOnceToStderr(this.conf, this.context, msg),
		};
	}

	private track(promise: Promise<unknown>): void {
		this.pendingFetches.add(promise);
		// The tracked promise only resolves, but stay defensive so a stray rejection can't become unhandled.
		void promise.catch(() => {}).finally(() => this.pendingFetches.delete(promise));
	}
}
