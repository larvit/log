import { buildUrlFull, redactHeaderCredential, traceableUrl } from "../credentials/span-values.js";
import { type OtlpSpan, SPAN_KIND_CLIENT, STATUS_CODE_ERROR, STATUS_CODE_UNSET } from "../otlp/payloads.js";
import type { Metadata } from "../primitives/metadata.js";
import { childSpan, endSpan, fetchErrorType, type SpanFailure, type SpanHost } from "./spans.js";
import { formatTraceparent } from "./traceparent.js";

// What log.fetch reads of its Log, as plain values a test can hand it.
export type FetchTrace = SpanHost & {
	captureQuery?: boolean,
	captureRequestHeaders?: string[],
	captureResponseHeaders?: string[],
	context: Metadata,
	warn: (msg: string) => void,
};

// An invalid name makes headers.get throw, which must never cost the platform's result.
export function capturedHeaders(trace: FetchTrace, option: "captureRequestHeaders" | "captureResponseHeaders", headers: Headers): Metadata {
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

// Every attribute known from the url and the method alone, so a request that fails to build still records them.
export function requestAttributes(trace: FetchTrace, url: URL, method: string): Metadata {
	return {
		...trace.context,
		"http.request.method": method,
		"server.address": url.hostname,
		...url.port ? { "server.port": Number(url.port) } : {},
		"url.full": buildUrlFull(url, trace.captureQuery === true),
		"url.scheme": url.protocol.replace(/:$/, ""),
	};
}

export function responseAttributes(trace: FetchTrace, res: Pick<Response, "headers" | "status">): Metadata {
	return { "http.response.status_code": res.status, ...capturedHeaders(trace, "captureResponseHeaders", res.headers) };
}

export const spanStatusCode = (status: number) => status >= 400 ? STATUS_CODE_ERROR : STATUS_CODE_UNSET;

export function fetchFailure(err: unknown, url: URL): SpanFailure {
	return { error: err, errorType: fetchErrorType(err), url };
}

// What goes to the platform's fetch, carrying `traceparent` unless the caller set one.
// A spread drops a Request's method, body, signal and other settings, which are prototype getters.
// So the platform builds the request from it, as fetch(url, init) would, and traceparent goes on that.
function outgoing(url: URL, init: RequestInit | undefined, traceparent: string): { headers: Headers, request?: Request } {
	const request = typeof Request === "function" && init instanceof Request ? new Request(url, init) : undefined;
	const headers = request?.headers ?? new Headers(init?.headers);

	if (!headers.has("traceparent")) {
		headers.set("traceparent", traceparent);
	}

	return { headers, request };
}

// A throwing clock or queue costs the span, never the platform's result.
async function tracedFetch(trace: FetchTrace, url: URL, init: RequestInit | undefined): Promise<Response> {
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
		attributes = requestAttributes(trace, url, method);

		const { headers, request } = outgoing(url, init, formatTraceparent(span.traceId, span.spanId, trace.sampled));

		attributes = { ...attributes, ...capturedHeaders(trace, "captureRequestHeaders", headers) };

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

// The page's address, which a relative url resolves against; undefined outside a browser, or where the getter throws.
function pageHref(): string | undefined {
	try {
		return (globalThis as { location?: { href?: string } }).location?.href;
	} catch {
		return undefined;
	}
}

// log.fetch as a whole: a url the credentials/ rule declines goes to the platform untraced, and any other is traced.
// `track` gets a promise that settles once a traced request's span is queued, and isn't called for an untraced one.
export function traceFetch(trace: FetchTrace, input: string | URL, init: RequestInit | undefined, track: (spanQueued: Promise<void>) => void): Promise<Response> {
	const url = traceableUrl(input, pageHref());

	if (!url) {
		return globalThis.fetch(input, init);
	}

	// Registered synchronously, so a later await log.flush() delivers a fire-and-forget log.fetch().
	// Settled on the caller's promise, never tracked from it: a handler there would mark its rejection handled.
	// The executor runs at once, so `settle` is always set by the time the fetch settles.
	let settle: (() => void) | undefined;

	track(new Promise<void>(resolve => { settle = resolve; }));

	return tracedFetch(trace, url, init).finally(() => settle?.());
}
