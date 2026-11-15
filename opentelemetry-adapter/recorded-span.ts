import type { Attributes, AttributeValue, Span, SpanContext, SpanOptions, SpanStatus, TimeInput } from "@opentelemetry/api";
import { attributesOf, getNsTimestamp, type OtlpSpan, STATUS_CODE_ERROR, STATUS_CODE_OK, STATUS_CODE_UNSET } from "../otlp/payloads.js";
import { exportSpan } from "../tracing/spans.js";
import type { Log } from "../log/log.js";
import type { Metadata } from "../primitives/metadata.js";
import { redactedRecordedAttribute, redactedRecordedValue } from "../credentials/span-values.js";
import { spanIdFrom, traceIdFrom } from "../tracing/traceparent.js";
import { transportsOf } from "../log/log-transports.js";

// A number below the process's start counts from it, as performance.now() does: the rule of
// `timeInputToHrTime` in @opentelemetry/core, which instrumentation written against the SDK relies on.
function epochMs(time: Date | number): number {
	if (time instanceof Date) return time.getTime();

	const processStart = globalThis.performance?.timeOrigin;

	return processStart !== undefined && time < processStart ? processStart + time : time;
}

// A time that is no time, such as NaN or an HrTime with a fraction, reads as now: a throw here
// would surface inside the instrumented library's own call.
function nsTimestamp(time: TimeInput | undefined, log: Log): string {
	if (Array.isArray(time)) {
		if (time.length === 2 && time.every(Number.isInteger)) return String((BigInt(time[0]) * BigInt(1000000000)) + BigInt(time[1]));
	} else if (time !== undefined && Number.isFinite(epochMs(time))) {
		return getNsTimestamp(epochMs(time));
	}

	return getNsTimestamp(log.conf.clock.now());
}

// OTLP numbers the kinds one above OpenTelemetry's API, whose 0 is INTERNAL.
const OTLP_KINDS = [1, 2, 3, 4, 5] as const;

// Exported once, as a copy, when it ends: whatever is set on it later is never exported.
export class RecordedSpan implements Span {
	private readonly attributes: Metadata;
	private ended = false;
	private readonly span: Omit<OtlpSpan, "attributes" | "endTimeUnixNano">;

	constructor(private readonly log: Log, scope: Metadata, name: string, options: SpanOptions, parent: SpanContext | undefined) {
		this.attributes = { ...scope };
		this.span = {
			droppedAttributesCount: 0,
			droppedEventsCount: 0,
			droppedLinksCount: options.links?.length ?? 0,
			events: [],
			kind: OTLP_KINDS[options.kind ?? 0] ?? 1,
			links: [],
			name,
			parentSpanId: parent?.spanId,
			spanId: spanIdFrom(log.conf.randomBytes),
			startTimeUnixNano: nsTimestamp(options.startTime, log),
			status: { code: STATUS_CODE_UNSET },
			traceId: parent?.traceId ?? traceIdFrom(log.conf.randomBytes),
		};
		this.setAttributes(options.attributes ?? {});
	}

	addEvent(): this {
		this.span.droppedEventsCount++;

		return this;
	}

	addLink(): this {
		return this.addLinks([undefined]);
	}

	addLinks(links: unknown[]): this {
		this.span.droppedLinksCount += links.length;

		return this;
	}

	end(endTime?: TimeInput): void {
		if (this.ended) return;

		this.ended = true;

		// The span's own attribute wins over the Log's context, as a log.fetch span's does.
		const attributes: Metadata = { ...this.log.context };

		for (const [key, value] of Object.entries(this.attributes)) {
			attributes[key] = typeof value === "string" ? redactedRecordedAttribute(key, value) : value;
		}

		const status = this.span.status.message === undefined ? this.span.status : { ...this.span.status, message: redactedRecordedValue(this.span.status.message) };
		const span = { ...this.span, attributes: attributesOf(attributes), endTimeUnixNano: nsTimestamp(endTime, this.log), name: redactedRecordedValue(this.span.name), status };

		// Over the Log's documented fields, so the hand-off adds no member to Log.
		exportSpan({ sampled: this.log.sampled, transports: transportsOf(this.log.conf) }, span, attributes);
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
		if (value === undefined || value === null) return this;

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
		if (this.span.status.code === STATUS_CODE_OK || code === STATUS_CODE_UNSET) return this;

		// OTLP numbers the status codes as OpenTelemetry's API does.
		this.span.status = code === STATUS_CODE_ERROR && message ? { code, message } : { code };

		return this;
	}

	spanContext(): SpanContext {
		return { spanId: this.span.spanId, traceFlags: 1, traceId: this.span.traceId };
	}

	updateName(name: string): this {
		this.span.name = name;

		return this;
	}
}
