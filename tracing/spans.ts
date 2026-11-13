import type { Log } from "../log/log.js";
import type { ResolvedLogConf } from "../log/types.js";
import { attributesOf, buildSpanPayload, getNsTimestamp, type OtlpSpan, SPAN_KIND_INTERNAL, STATUS_CODE_UNSET } from "../otlp/payloads.js";
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

export function openSpan(conf: ResolvedLogConf): { sampled: boolean, span: OtlpSpan } {
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

export function childSpan(log: Pick<Log, "conf" | "span">, name: string, kind: OtlpSpan["kind"]): OtlpSpan {
	return newSpan({
		kind,
		name,
		parentSpanId: log.span.spanId,
		spanId: spanIdFrom(log.conf.randomBytes),
		traceId: log.span.traceId,
	}, log.conf.clock.now());
}

export function exportSpan(log: Pick<Log, "conf" | "sampled">, span: OtlpSpan, attributes: Metadata): void {
	if (log.sampled) {
		const spanAttributes = attributesOf(attributes);

		// README → Audience: each documented span attribute is on `log.span` as on the wire.
		if (spanAttributes.length) {
			span.attributes = spanAttributes;
		}

		log.conf.otlpQueue?.enqueue(buildSpanPayload({ attributes, span }));
	}
}
