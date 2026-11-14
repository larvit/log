import { failureMessage } from "../credentials/span-values.js";
import { attributesOf, buildSpanPayload, getNsTimestamp, type OtlpSpan, SPAN_KIND_INTERNAL, STATUS_CODE_ERROR, STATUS_CODE_UNSET } from "../otlp/payloads.js";
import type { OtlpQueue } from "../otlp/queue-types.js";
import type { Clock } from "../primitives/clock.js";
import type { Metadata } from "../primitives/metadata.js";
import { parseTraceparent, spanIdFrom, traceIdFrom } from "./traceparent.js";

// A span just opened: it starts and ends now, and doesn't carry any attributes, events or links yet.
function newSpan(fields: Pick<OtlpSpan, "kind" | "name" | "parentSpanId" | "spanId" | "traceId">, nowMs: number): OtlpSpan {
	const startedAt = getNsTimestamp(nowMs);

	return {
		attributes: [],
		droppedAttributesCount: 0,
		droppedEventsCount: 0,
		droppedLinksCount: 0,
		endTimeUnixNano: startedAt,
		events: [],
		links: [],
		startTimeUnixNano: startedAt,
		status: { code: STATUS_CODE_UNSET },
		...fields,
	};
}

// What openSpan reads of a Log's settings.
export type SpanOrigin = {
	clock: Clock,
	parentLog?: { sampled?: boolean, span: OtlpSpan },
	randomBytes: (size: number) => Uint8Array,
	spanName?: string,
	traceparent?: string,
};

// What childSpan and endSpan read of a Log: the Log's clock, randomness, queue, sampled flag and own span.
export type SpanHost = Pick<SpanOrigin, "clock" | "randomBytes"> & { otlpQueue?: OtlpQueue, sampled: boolean, span: OtlpSpan };

export function openSpan(conf: SpanOrigin): { sampled: boolean, span: OtlpSpan } {
	const incoming = !conf.parentLog && conf.traceparent ? parseTraceparent(conf.traceparent) : null;

	return {
		sampled: conf.parentLog?.sampled ?? incoming?.sampled ?? true,
		span: newSpan({
			kind: SPAN_KIND_INTERNAL,
			name: conf.spanName || "unnamed-span",
			parentSpanId: conf.parentLog?.span.spanId ?? incoming?.spanId,
			spanId: spanIdFrom(conf.randomBytes),
			traceId: conf.parentLog?.span.traceId || incoming?.traceId || traceIdFrom(conf.randomBytes),
		}, conf.clock.now()),
	};
}

export function childSpan(host: Pick<SpanHost, "clock" | "randomBytes" | "span">, name: string, kind: OtlpSpan["kind"]): OtlpSpan {
	return newSpan({
		kind,
		name,
		parentSpanId: host.span.spanId,
		spanId: spanIdFrom(host.randomBytes),
		traceId: host.span.traceId,
	}, host.clock.now());
}

// What a span failed with. Each caller picks `errorType`, the span's `error.type`, by its own documented
// fallback; `url` is the one a fetch handed the runtime, which may quote it back in the error's message.
export interface SpanFailure { error: unknown, errorType: string, url?: URL }

export function endSpan(host: Pick<SpanHost, "clock" | "otlpQueue" | "sampled">, span: OtlpSpan, attributes: Metadata, failure?: SpanFailure): void {
	span.endTimeUnixNano = getNsTimestamp(host.clock.now());

	if (failure) {
		span.status = { code: STATUS_CODE_ERROR, message: failureMessage(failure.error, failure.url) };
	}

	if (host.sampled) {
		const ended = failure ? { ...attributes, "error.type": failure.errorType } : attributes;
		const spanAttributes = attributesOf(ended);

		// README → Audience: each documented span attribute is on `log.span` as on the wire.
		if (spanAttributes.length) {
			span.attributes = spanAttributes;
		}

		host.otlpQueue?.enqueue(buildSpanPayload({ attributes: ended, span }));
	}
}
