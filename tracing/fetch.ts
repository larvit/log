import { buildUrlFull, redactHeaderCredential } from "../credentials/span-values.js";
import { type OtlpSpan, SPAN_KIND_CLIENT, STATUS_CODE_ERROR, STATUS_CODE_UNSET } from "../otlp/payloads.js";
import { numberFieldAsString, stringField } from "../primitives/failure-fields.js";
import type { Metadata } from "../primitives/metadata.js";
import { childSpan, endSpan, type SpanFailure, type SpanHost } from "./spans.js";
import { formatTraceparent } from "./traceparent.js";

// What log.fetch reads of its Log: the span's host, the capture settings and context, and the
// Log's own way to warn. `tracing/` never names `Log`, so a test hands it plain values.
export type FetchTrace = SpanHost & {
	captureQuery?: boolean,
	captureRequestHeaders?: string[],
	captureResponseHeaders?: string[],
	context: Metadata,
	warn: (msg: string) => void,
};

// An invalid name makes headers.get throw, which must never cost the platform's result.
function capturedHeaders(trace: FetchTrace, option: "captureRequestHeaders" | "captureResponseHeaders", headers: Headers): Metadata {
	const prefix = option === "captureRequestHeaders" ? "http.request.header." : "http.response.header.";
	const captured: Metadata = {};

	for (const [index, name] of (trace[option] ?? []).entries()) {
		let key: string;
		let value: string | null;

		try {
			key = name.toLowerCase();
			value = headers.get(name);
		} catch {
			// The index, never the name: an invalid one may be a whole header line, value and all.
			try {
				trace.warn(`@larvit/log: ${option}[${index}] is not a valid header name, so log.fetch skips it`);
			} catch {
				// A stderr that throws costs the warning.
			}

			continue;
		}

		if (value !== null) {
			captured[prefix + key] = redactHeaderCredential(key, value);
		}
	}

	return captured;
}

// Every attribute known before the request is sent; `headers` already carries the traceparent.
export function requestAttributes(trace: FetchTrace, url: URL, method: string, headers: Headers): Metadata {
	return {
		...trace.context,
		"http.request.method": method,
		"server.address": url.hostname,
		...url.port ? { "server.port": Number(url.port) } : {},
		"url.full": buildUrlFull(url, trace.captureQuery === true),
		"url.scheme": url.protocol.replace(/:$/, ""),
		...capturedHeaders(trace, "captureRequestHeaders", headers),
	};
}

export function responseAttributes(trace: FetchTrace, res: Pick<Response, "headers" | "status">): Metadata {
	return { "http.response.status_code": res.status, ...capturedHeaders(trace, "captureResponseHeaders", res.headers) };
}

export const spanStatusCode = (status: number) => status >= 400 ? STATUS_CODE_ERROR : STATUS_CODE_UNSET;

// README's value: the error's code, else its name, else fetch_error. end() applies semconv's `_OTHER` fallback instead; that waits for 3.0.0.
export function fetchFailure(err: unknown, url: URL): SpanFailure {
	return { error: err, errorType: stringField(err, "code") ?? numberFieldAsString(err, "code") ?? stringField(err, "name") ?? "fetch_error", url };
}

// A throwing clock or queue costs the span, never the platform's result.
export async function tracedFetch(trace: FetchTrace, url: URL, init: RequestInit | undefined): Promise<Response> {
	let span: OtlpSpan;

	try {
		span = childSpan(trace, url.host, SPAN_KIND_CLIENT);
	} catch {
		return globalThis.fetch(url, init);
	}

	let attributes: Metadata = { ...trace.context };
	let failure: SpanFailure | undefined;

	try {
		const method = (init?.method ?? "GET").toUpperCase();

		span.name = `${method} ${url.host}`;

		// A spread drops a Request's method, body, signal and other settings, which are prototype getters.
		// So the platform builds the request from it, as fetch(url, init) would, and traceparent goes on that.
		const request = typeof Request === "function" && init instanceof Request ? new Request(url, init) : undefined;
		const headers = request?.headers ?? new Headers(init?.headers);

		if (!headers.has("traceparent")) {
			headers.set("traceparent", formatTraceparent(span.traceId, span.spanId, trace.sampled));
		}

		attributes = requestAttributes(trace, url, method, headers);

		const res = await (request ? globalThis.fetch(request) : globalThis.fetch(url, { ...init, headers }));

		span.status.code = spanStatusCode(res.status);
		attributes = { ...attributes, ...responseAttributes(trace, res) };

		return res;
	} catch (err) {
		failure = fetchFailure(err, url);

		throw err;
	} finally {
		try {
			endSpan(trace, span, attributes, failure);
		} catch {
			// The span is dropped.
		}
	}
}
