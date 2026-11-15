import type { Attributes, AttributeValue, Span, SpanContext, SpanOptions, SpanStatus, TimeInput } from "@opentelemetry/api";
import { attributesOf, getNsTimestamp, type OtlpSpan, STATUS_CODE_ERROR, STATUS_CODE_OK, STATUS_CODE_UNSET } from "../otlp/payloads.js";
import type { Log } from "../log/log.js";
import type { Metadata } from "../primitives/metadata.js";
import { spanIdFrom, traceIdFrom } from "../tracing/traceparent.js";

// A number below the process's start counts from it, as performance.now() does: the rule of
// `timeInputToHrTime` in @opentelemetry/core, which instrumentation written against the SDK relies on.
function nsTimestamp(time: TimeInput | undefined, log: Log): string {
	if (time === undefined) return getNsTimestamp(log.conf.clock.now());
	if (Array.isArray(time)) return String((BigInt(time[0]) * BigInt(1000000000)) + BigInt(time[1]));
	if (time instanceof Date) return getNsTimestamp(time.getTime());

	const processStart = globalThis.performance?.timeOrigin;

	return getNsTimestamp(processStart !== undefined && time < processStart ? processStart + time : time);
}

// A span an OpenTelemetry tracer started under a Log, exported through that Log when it ends. It
// leaves out what an OtlpSpan cannot hold and counts each in the span's dropped counts: an event, a
// link, and an attribute value that is a list.
export class RecordedSpan implements Span {
	private readonly attributes: Metadata;
	private ended = false;
	private readonly span: OtlpSpan;

	constructor(private readonly log: Log, scope: Metadata, name: string, options: SpanOptions, parent: SpanContext | undefined) {
		const startedAt = nsTimestamp(options.startTime, log);

		this.attributes = { ...scope };
		this.span = {
			attributes: [],
			droppedAttributesCount: 0,
			droppedEventsCount: 0,
			droppedLinksCount: options.links?.length ?? 0,
			endTimeUnixNano: startedAt,
			events: [],
			// OTLP numbers the kinds one above OpenTelemetry's API, whose 0 is INTERNAL.
			kind: (options.kind ?? 0) + 1 as OtlpSpan["kind"],
			links: [],
			name,
			parentSpanId: parent?.spanId,
			spanId: spanIdFrom(log.conf.randomBytes),
			startTimeUnixNano: startedAt,
			status: { code: STATUS_CODE_UNSET },
			traceId: parent?.traceId ?? traceIdFrom(log.conf.randomBytes),
		};
		this.setAttributes(options.attributes ?? {});
	}

	addEvent(): this {
		if (!this.ended) this.span.droppedEventsCount++;

		return this;
	}

	addLink(): this {
		return this.addLinks([undefined]);
	}

	addLinks(links: unknown[]): this {
		if (!this.ended) this.span.droppedLinksCount += links.length;

		return this;
	}

	end(endTime?: TimeInput): void {
		if (this.ended) return;

		this.ended = true;

		// The span's own attribute wins over the Log's context, as a log.fetch span's does.
		const attributes = { ...this.log.context, ...this.attributes };

		this.log.exportSpan({ ...this.span, attributes: attributesOf(attributes), endTimeUnixNano: nsTimestamp(endTime, this.log) }, attributes);
	}

	isRecording(): boolean {
		return !this.ended;
	}

	// OpenTelemetry records an exception as an event.
	recordException(): void {
		this.addEvent();
	}

	// OpenTelemetry's API ignores a null or undefined value.
	setAttribute(key: string, value: AttributeValue | null | undefined): this {
		if (this.ended || value === undefined || value === null) return this;

		if (typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
			this.attributes[key] = value;
		} else {
			this.span.droppedAttributesCount++;
		}

		return this;
	}

	setAttributes(attributes: Attributes): this {
		for (const key of Object.keys(attributes)) {
			this.setAttribute(key, attributes[key]);
		}

		return this;
	}

	// OpenTelemetry's API: OK is final, UNSET is ignored, and only ERROR carries a message.
	setStatus({ code, message }: SpanStatus): this {
		if (this.ended || this.span.status.code === STATUS_CODE_OK || code === STATUS_CODE_UNSET) return this;

		// OTLP numbers the status codes as OpenTelemetry's API does.
		this.span.status = code === STATUS_CODE_ERROR && message ? { code, message } : { code };

		return this;
	}

	spanContext(): SpanContext {
		return { spanId: this.span.spanId, traceFlags: 1, traceId: this.span.traceId };
	}

	updateName(name: string): this {
		if (!this.ended) this.span.name = name;

		return this;
	}
}
