// OTLP payloads: the wire types, and building a payload from an entry or a span.

import { LogLevels } from "../log/entry-format.js";
import type { LogLevel, Metadata } from "../log/types.js";

export type OtlpAttribute = {
	key: string,
	value: {
		stringValue: string
	}
};

export type OtlpScope = { name: string, version?: string };

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
			scope?: OtlpScope,
		}[],
	}[],
};

export type OtlpSpan = {
	attributes: OtlpAttribute[],
	droppedAttributesCount: number,
	droppedEventsCount: number,
	droppedLinksCount: number,
	endTimeUnixNano: string,
	events: [],
	kind: 0 | 1 | 2 | 3 | 4 | 5,
	links: [],
	name: string,
	parentSpanId?: string,
	spanId: string,
	startTimeUnixNano: string,
	status: { code: number, message?: string },
	traceId: string,
};

export type OtlpSpanPayload = {
	resourceSpans: {
		resource: {
			attributes: OtlpAttribute[],
			droppedAttributesCount: number,
		},
		scopeSpans: {
			scope: OtlpScope,
			spans: OtlpSpan[],
		}[],
	}[],
};

type PayloadByKind = { logs: OtlpLogPayload, traces: OtlpSpanPayload };

type OtlpKind = keyof PayloadByKind;

export type OtlpPayload = PayloadByKind[OtlpKind];

export const PAYLOAD_KEYS: { [K in OtlpKind]: keyof PayloadByKind[K] } = { logs: "resourceLogs", traces: "resourceSpans" };

const SCOPE = { name: "@larvit/log", version: "__version__" } as const satisfies OtlpScope;

// OTLP's Span.SpanKind and Status.StatusCode enum values.
export const SPAN_KIND_INTERNAL = 1;
export const SPAN_KIND_CLIENT = 3;
export const STATUS_CODE_UNSET = 0;
export const STATUS_CODE_ERROR = 2;

// The one branch on a payload's kind, so a new kind fails to compile at every caller.
export function byKind<R>(payload: OtlpPayload, handlers: { [K in OtlpKind]: (payload: PayloadByKind[K]) => R }): R {
	if (PAYLOAD_KEYS.logs in payload) {
		return handlers.logs(payload);
	}

	if (PAYLOAD_KEYS.traces in payload) {
		return handlers.traces(payload);
	}

	return payload satisfies never;
}

export function payloadKind(payload: OtlpPayload): OtlpKind {
	return byKind<OtlpKind>(payload, { logs: () => "logs", traces: () => "traces" });
}

export function getNsTimestamp(msTimestamp: number): string {
	const seconds = Math.floor(msTimestamp / 1000);
	// A performance.now()-based clock hands back fractions finer than a nanosecond.
	const nanos = Math.round((msTimestamp % 1000) * 1000000);

	const totalNanos = (BigInt(seconds) * BigInt(1000000000)) + BigInt(nanos);

	return totalNanos.toString();
}

// Grafana/Loki reads service.name from here, not from the records.
function buildResourceAttributes(attributes: Metadata): OtlpAttribute[] {
	return [
		{ key: "service.name", value: { stringValue: String(attributes["service.name"] || "unnamed-service") } },
		{ key: "telemetry.sdk.language", value: { stringValue: "ecmascript" } },
		{ key: "telemetry.sdk.name", value: { stringValue: SCOPE.name } },
		{ key: "telemetry.sdk.version", value: { stringValue: SCOPE.version } },
	];
}

// service.name is carried on the resource, so it is excluded from the per-record and span attributes.
export function attributesOf(attributes: Metadata): OtlpAttribute[] {
	return Object.entries(attributes)
		.filter(([key]) => key !== "service.name")
		.map(([key, value]) => ({ key, value: { stringValue: String(value) } }));
}

// Unredacted, per README → Credentials in a captured value: the message, metadata and context are
// the caller's own text.
export function buildLogPayload(opts: {
	attributes: Metadata,
	logLevel: LogLevel,
	msg: string,
	msTimestamp: number,
	span: OtlpSpan,
}): OtlpLogPayload {
	const { attributes, logLevel, msTimestamp, msg, span } = opts;

	const recordAttributes = attributesOf(attributes);

	return {
		resourceLogs: [{
			resource: { attributes: buildResourceAttributes(attributes) },
			scopeLogs: [{
				logRecords: [{
					...recordAttributes.length ? { attributes: recordAttributes } : {},
					body: { stringValue: msg },
					severityNumber: LogLevels[logLevel].severityNumber,
					severityText: LogLevels[logLevel].severityText,
					spanId: span.spanId,
					timeUnixNano: getNsTimestamp(msTimestamp),
					traceId: span.traceId,
				}],
				scope: { ...SCOPE },
			}],
		}],
	};
}

// Unredacted: callers redact what they capture into `attributes`, and per README → Credentials in a
// captured value, the context and span name go as written. `attributes` feeds the resource only; the
// span goes out as it is, with the attributes it already holds.
export function buildSpanPayload(opts: {
	attributes: Metadata,
	span: OtlpSpan,
}): OtlpSpanPayload {
	const { attributes, span } = opts;

	return {
		resourceSpans: [{
			resource: {
				attributes: buildResourceAttributes(attributes),
				droppedAttributesCount: 0,
			},
			scopeSpans: [{
				scope: { ...SCOPE },
				spans: [span],
			}],
		}],
	};
}
