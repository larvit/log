import { failureMessage } from "../credentials/span-values.js";
import { attributesOf, buildSpanPayload, getNsTimestamp, type OtlpSpan, SPAN_KIND_INTERNAL, STATUS_CODE_ERROR, STATUS_CODE_UNSET } from "../otlp/payloads.js";
import type { OtlpQueue } from "../otlp/queue/queue-types.js";
import type { Clock } from "../primitives/clock.js";
import { numberFieldAsString, stringField } from "../primitives/failure-fields.js";
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

// What childSpan, spanEnd and exportSpan read of a Log: the Log's clock, randomness, queue, sampled flag and own span.
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

// What a span failed with. `errorType`, the span's `error.type`, comes from one of the two functions
// below; `url` is the one a fetch handed the runtime, which may quote it back in the error's message.
export interface SpanFailure { error: unknown, errorType: string, url?: URL }

// A failed span's `error.type` follows one of two rules, and the README documents both. A `log.fetch`
// span (README → "`log.fetch` in depth") takes the error's `code`, a numeric one as digits, else
// its `name`, else `"fetch_error"`. A span closed by `log.end({ error })` (README → "Group logs into a trace") takes
// the error's string `code`, else its `name`, else `"_OTHER"`, the fallback of OpenTelemetry's semantic
// conventions. Both values are published, so semver keeps the two rules apart until a major version.
export function fetchErrorType(err: unknown): string {
	return stringField(err, "code") ?? numberFieldAsString(err, "code") ?? stringField(err, "name") ?? "fetch_error";
}

export function endErrorType(err: unknown): string {
	return stringField(err, "code") ?? stringField(err, "name") ?? "_OTHER";
}

// How a span ends: `fields`, what its end sets on it, and `attributes`, what it exports with. `fields`
// holds `attributes` only where the span is sampled and has any: README → Audience puts each documented
// span attribute on `log.span` as on the wire.
export interface SpanEnd {
	attributes: Metadata,
	fields: Pick<OtlpSpan, "endTimeUnixNano"> & Partial<Pick<OtlpSpan, "attributes" | "status">>,
}

export function spanEnd(host: Pick<SpanHost, "clock" | "sampled">, attributes: Metadata, failure?: SpanFailure): SpanEnd {
	const endTimeUnixNano = getNsTimestamp(host.clock.now());
	const status = failure ? { status: { code: STATUS_CODE_ERROR, message: failureMessage(failure.error, failure.url) } } : {};
	const ended = failure ? { ...attributes, "error.type": failure.errorType } : attributes;
	const spanAttributes = host.sampled ? attributesOf(ended) : [];

	return { attributes: ended, fields: { endTimeUnixNano, ...status, ...spanAttributes.length ? { attributes: spanAttributes } : {} } };
}

// Queues an ended span, where its trace is sampled.
export function exportSpan(host: Pick<SpanHost, "otlpQueue" | "sampled">, span: OtlpSpan, attributes: Metadata): void {
	if (host.sampled) {
		host.otlpQueue?.enqueue(buildSpanPayload({ attributes, span }));
	}
}
