import { buildUrlFull, redactHeaderCredential } from "../credentials/span-values.js";
import type { Log } from "../log/log.js";
import { warnOnceToStderr } from "../log/stderr-warnings.js";
import { type OtlpSpan, SPAN_KIND_CLIENT, STATUS_CODE_ERROR, STATUS_CODE_UNSET } from "../otlp/payloads.js";
import { numberFieldAsString, stringField } from "../primitives/failure-fields.js";
import type { Metadata } from "../primitives/metadata.js";
import { childSpan, endSpan, type SpanFailure } from "./spans.js";
import { formatTraceparent } from "./traceparent.js";

// An invalid name makes headers.get throw, which must never cost the platform's result.
function capturedHeaders(log: Pick<Log, "conf" | "context">, option: "captureRequestHeaders" | "captureResponseHeaders", headers: Headers): Metadata {
	const prefix = option === "captureRequestHeaders" ? "http.request.header." : "http.response.header.";
	const captured: Metadata = {};

	for (const [index, name] of (log.conf[option] ?? []).entries()) {
		let key: string;
		let value: string | null;

		try {
			key = name.toLowerCase();
			value = headers.get(name);
		} catch {
			// The index, never the name: an invalid one may be a whole header line, value and all.
			try {
				warnOnceToStderr(log.conf, log.context, `@larvit/log: ${option}[${index}] is not a valid header name, so log.fetch skips it`);
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

// A throwing clock or queue costs the span, never the platform's result.
export async function tracedFetch(log: Pick<Log, "conf" | "context" | "sampled" | "span">, url: URL, init: RequestInit | undefined): Promise<Response> {
	let span: OtlpSpan;

	try {
		span = childSpan(log, url.host, SPAN_KIND_CLIENT);
	} catch {
		return globalThis.fetch(url, init);
	}

	const attributes: Metadata = { ...log.context };
	let failure: SpanFailure | undefined;

	try {
		const method = (init?.method ?? "GET").toUpperCase();

		span.name = `${method} ${url.host}`;
		Object.assign(attributes, {
			"http.request.method": method,
			"server.address": url.hostname,
			...url.port ? { "server.port": Number(url.port) } : {},
			"url.full": buildUrlFull(url, log.conf.captureQuery === true),
			"url.scheme": url.protocol.replace(/:$/, ""),
		});

		// A spread drops a Request's method, body, signal and other settings, which are prototype getters.
		// So the platform builds the request from it, as fetch(url, init) would, and traceparent goes on that.
		const request = typeof Request === "function" && init instanceof Request ? new Request(url, init) : undefined;
		const headers = request?.headers ?? new Headers(init?.headers);

		if (!headers.has("traceparent")) {
			headers.set("traceparent", formatTraceparent(span.traceId, span.spanId, log.sampled));
		}

		Object.assign(attributes, capturedHeaders(log, "captureRequestHeaders", headers));

		const res = await (request ? globalThis.fetch(request) : globalThis.fetch(url, { ...init, headers }));

		attributes["http.response.status_code"] = res.status;
		span.status.code = res.status >= 400 ? STATUS_CODE_ERROR : STATUS_CODE_UNSET;

		Object.assign(attributes, capturedHeaders(log, "captureResponseHeaders", res.headers));

		return res;
	} catch (err) {
		// README's value: the error's code, else its name, else fetch_error. end() applies semconv's `_OTHER` fallback instead; that waits for 3.0.0.
		failure = { error: err, errorType: stringField(err, "code") ?? numberFieldAsString(err, "code") ?? stringField(err, "name") ?? "fetch_error", url };

		throw err;
	} finally {
		try {
			endSpan(log, span, attributes, failure);
		} catch {
			// The span is dropped.
		}
	}
}
