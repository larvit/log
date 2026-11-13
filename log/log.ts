// The Log class.

import { buildLogPayload, getNsTimestamp, type OtlpSpan, STATUS_CODE_ERROR } from "../otlp/payloads.js";
import { tracedFetch } from "../tracing/fetch.js";
import { failureMessage, pageHref, traceableUrl } from "../tracing/span-credentials.js";
import { exportSpan, openSpan } from "../tracing/spans.js";
import { formatTraceparent } from "../tracing/traceparent.js";
import { DEFAULT_LOG_LEVEL, formatterOf, LogLevels, SEVERITY_NUMBERS, withoutUndefined } from "./entry-format.js";
import { stringField } from "./failure-fields.js";
import { confFromOptions, inherited, optionsFromSettings, resolveLogConf } from "./settings.js";
import { describeLogLevel, warnOnceToStderr, writeOnce, writeStderr } from "./stderr-warnings.js";
import type { LogInt, LogLevel, LogOptions, Metadata, MetadataInput, ResolvedLogConf } from "./types.js";

export class Log implements LogInt {
	context: Metadata;
	ended: boolean = false;

	readonly conf: ResolvedLogConf;

	// Un-awaited log.fetch calls, awaited by flush() so their spans are queued before the queue flushes.
	private pendingFetches = new Set<Promise<unknown>>();

	// W3C sampled flag; false exports no spans and propagates 00.
	readonly sampled: boolean;

	span: OtlpSpan;

	constructor(options?: LogOptions | LogLevel | "none") {
		const { conf, deprecations } = resolveLogConf(options);

		this.conf = conf;
		// Own copy, so a clone/child never mutates a context object shared with another instance.
		this.context = withoutUndefined(conf.context);

		for (const msg of deprecations) {
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

		return new Log(optionsFromSettings(inherited(confFromOptions(options), this, "clone")));
	}

	public async end(options?: { error?: unknown }): Promise<void> {
		this.throwIfEnded();
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
		await Promise.all([...this.pendingFetches]);
		await this.conf.otlpQueue?.flush();
	}

	public traceparent(): string {
		return formatTraceparent(this.span.traceId, this.span.spanId, this.sampled);
	}

	public fetch(input: string | URL, init?: RequestInit): Promise<Response> {
		this.throwIfEnded();

		const url = traceableUrl(input, pageHref());

		if (!url) {
			return globalThis.fetch(input, init);
		}

		// Registered synchronously, so a later await log.flush() delivers a fire-and-forget log.fetch().
		// Settled on the caller's promise, never tracked from it: a handler there would mark its rejection handled.
		// The executor runs at once, so `settle` is always set by the time the fetch settles.
		let settle: (() => void) | undefined;

		this.track(new Promise<void>(resolve => { settle = resolve; }));

		return tracedFetch(this, url, init).finally(() => settle?.());
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
		this.pendingFetches.add(promise);
		// The tracked promise only resolves, but stay defensive so a stray rejection can't become unhandled.
		void promise.catch(() => {}).finally(() => this.pendingFetches.delete(promise));
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
