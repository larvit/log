import { holdsListedKeyInAnyDecoding, holdsUserinfoInAnyDecoding, redactTextQueryKeys, redactTextUserinfo } from "./text.js";
import { isCredentialHeaderName } from "./header-names.js";
import { redactedPath } from "./path.js";
import { redactedQuery, redactedWholeUrl } from "./query.js";
import { stringField } from "../primitives/field-reads.js";

// Where README → Credentials in a captured value is enforced, bullet by bullet:
// 1. A credential header name: isCredentialHeaderName in header-names.ts, applied by redactHeaderCredential.
// 2. A listed query key: isListedQueryKey and redactTextQueryKeys in text.ts, applied by redactsKeyAndValue and redactsValueOnly in query.ts.
// 3. A url in a kept query value or key: redactedSearch in query.ts, with redactQueryPair and readNestedUrl.
// 4. A url that parses whole, in a header value or status message: redactedWholeUrl in query.ts.
// 5. Userinfo after `//` or its backslash forms: redactTextUserinfo in text.ts, and in a query
//    pairsInUserinfoRunsOfAnyReading in query-userinfo-runs.ts.
// 6. A listed key after `?`, `&`, `#` or `;` in text: redactTextQueryKeys in text.ts.
// 7. A url nested in the path: redactedPath in path.ts.
// buildUrlFull assembles url.full from 3 and 7, failureMessage a span's status from 4 to 7, and
// redactedRecordedValue what an OpenTelemetry instrumentation recorded from 3 to 7.

export function redactHeaderCredential(name: string, value: string): string {
	return isCredentialHeaderName(name) || redactedWholeUrl(value) !== undefined || holdsUserinfoInAnyDecoding(value) || holdsListedKeyInAnyDecoding(value) ? "REDACTED" : value;
}

// The URL log.fetch traces: a scheme written without "//" parses to an opaque path, where
// userinfo, or a data: payload, sits in pathname and would ride into url.full.
export function parseHttpUrl(input: string | URL, baseHref: string | undefined): URL | undefined {
	let url: URL;

	try {
		url = new URL(String(input), baseHref);
	} catch {
		return undefined;
	}

	return url.protocol === "http:" || url.protocol === "https:" ? url : undefined;
}

// `url.origin` omits userinfo, which is what keeps the outer url's credentials off the span.
export function buildUrlFull(url: URL, captureQuery: boolean): string {
	const base = url.origin + redactedPath(url.pathname);

	return !captureQuery || !url.search ? base : `${base}?${redactedQuery(url) ?? url.searchParams.toString()}`;
}

// `url` is the one log.fetch handed the runtime, which quotes it back inside free text.
export function failureMessage(error: unknown, url?: URL): string {
	let message = stringField(error, "message");

	if (message === undefined) {
		try {
			message = String(error);
		} catch {
			message = "_OTHER";
		}
	}

	// Precise rules first, coarse after, so each coarse rule sees only what the finer ones left. First,
	// the known url, which the runtime quotes back: Firefox's `Window.fetch: <url> …` parses whole, its
	// quoted userinfo in the path.
	let quoted = message;

	if (url !== undefined) {
		const known = new URL(redactedWholeUrl(url.href) ?? url.href);

		known.pathname = redactedPath(url.pathname);
		quoted = message.split(url.href).join(known.href);
	}

	// Then the message as one url, then free text.
	const keyed = redactTextQueryKeys(redactTextUserinfo(redactedWholeUrl(quoted) ?? quoted));

	// Last, a listed key that only a decoding spells is beyond the text rules, so the message goes.
	return holdsListedKeyInAnyDecoding(keyed) ? "REDACTED" : keyed;
}

// The origin a recorded path or query, as in `url.path` or `http.target`, is read after.
const RELATIVE_BASE = "http://relative.invalid";

// A string attribute value, span name or status message an OpenTelemetry instrumentation recorded, read
// as failureMessage reads log.fetch's status, and as its url where it parses as one, alone or after
// RELATIVE_BASE. A value with nothing to redact stays as recorded, unnormalised. `url.query`, which
// OpenTelemetry's semantic conventions write without its `?`, is read as a query.
export function redactedRecordedValue(value: string, key?: string): string {
	if (key === "url.query") {
		return redactedQuery(new URL(`${RELATIVE_BASE}?${value}`)) ?? value;
	}

	// Appended, not resolved, so a path opening with `//` stays a path rather than naming a host.
	const url = parseHttpUrl(/^[/?]/.test(value) ? RELATIVE_BASE + value : value, undefined);

	if (url !== undefined) {
		const redacted = failureMessage(url.href, url);

		if (redacted !== url.href) {
			return redacted.startsWith(RELATIVE_BASE) ? redacted.slice(RELATIVE_BASE.length) : redacted;
		}
	}

	// The value as written too: parsing drops a `..` segment, and a credential before it.
	return failureMessage(value);
}
