import { attributesOf, getNsTimestamp, type OtlpSpan, SPAN_KIND_INTERNAL, STATUS_CODE_ERROR, STATUS_CODE_UNSET } from "../otlp/payloads.js";
import type { Clock } from "../primitives/clock.js";
import { failureMessage } from "../credentials/span-values.js";
import type { Metadata } from "../primitives/metadata.js";
import { numberFieldAsString, stringField } from "../primitives/field-reads.js";
import { parseTraceparent, spanIdFrom, traceIdFrom } from "./traceparent.js";

// A span just opened: it starts and ends at `startedAt`, in nanoseconds, and doesn't carry any attributes, events or links yet.
export function newSpan(fields: Pick<OtlpSpan, "kind" | "name" | "parentSpanId" | "spanId" | "traceId">, startedAt: string): OtlpSpan {

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

// An ended span of a sampled trace, as a transport is handed it. `attributes` holds what the span is
// exported with: the context of the Log that ended it, with `error.type` and, on a log.fetch span,
// its HTTP attributes.
export type TransportSpan = { attributes: Metadata, span: OtlpSpan };

// What childSpan, spanEnd and exportSpan read of a Log: the Log's clock, randomness, transports, sampled flag and own span.
// Of each transport, only its `span` method: the Transport contract sits in log/transport.ts, and
// imports point from log/ to tracing/.
export type SpanHost = Pick<SpanOrigin, "clock" | "randomBytes"> & { sampled: boolean, span: OtlpSpan, transports: readonly { span?: (span: TransportSpan) => void }[] };

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
		}, getNsTimestamp(conf.clock.now())),
	};
}

export function childSpan(host: Pick<SpanHost, "clock" | "randomBytes" | "span">, name: string, kind: OtlpSpan["kind"]): OtlpSpan {
	return newSpan({
		kind,
		name,
		parentSpanId: host.span.spanId,
		spanId: spanIdFrom(host.randomBytes),
		traceId: host.span.traceId,
	}, getNsTimestamp(host.clock.now()));
}

// What a span failed with. `errorType`, the span's `error.type`, comes from one of the two functions
// below; `url` is the one a fetch handed the runtime, which may quote it back in the error's message.
export interface SpanFailure { error: unknown, errorType: string, url?: URL }

// A failed span's `error.type`: two published rules (README → "`log.fetch` in depth", → "Group logs into a
// trace"), so they stay apart until a major version. `_OTHER` is the fallback of OpenTelemetry's semantic conventions.
export function fetchErrorType(err: unknown): string {
	return stringField(err, "code") ?? numberFieldAsString(err, "code") ?? stringField(err, "name") ?? "fetch_error";
}

export function endErrorType(err: unknown): string {
	return stringField(err, "code") ?? stringField(err, "name") ?? "_OTHER";
}

// How a span ends. `attributes`: the metadata it is exported with. `fields`: what end() sets on the span. Its
// `attributes` key, the wire-form list, is set only where the span is sampled and has any, since README → Audience
// promises each documented span attribute on `log.span` as on the wire.
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

// Hands an ended span to each transport that takes spans, where its trace is sampled.
export function exportSpan(host: Pick<SpanHost, "sampled" | "transports">, span: OtlpSpan, attributes: Metadata): void {
	if (host.sampled) {
		for (const transport of host.transports) {
			transport.span?.({ attributes, span });
		}
	}
}
