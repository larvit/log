import { stringField } from "../primitives/failure-fields.js";
import { isCredentialHeaderName } from "./header-names.js";
import { redactedPath } from "./path.js";
import { redactedQuery, redactedWholeUrl } from "./query.js";
import { holdsListedKeyInAnyDecoding, holdsUserinfoInAnyDecoding, redactTextQueryKeys, redactTextUserinfo } from "./text.js";

// What a span records of a url, a header and a failure. Where README → Credentials in a captured
// value is enforced, bullet by bullet:
// 1. A credential header name: isCredentialHeaderName in header-names.ts, applied by redactHeaderCredential.
// 2. A listed query key: isListedQueryKey and redactTextQueryKeys in text.ts, applied by PAIR_RULES in query.ts.
// 3. A url in a kept query value or key: redactedSearch in query.ts, with PAIR_RULES and readNestedUrl.
// 4. A url that parses whole, in a header value or status message: redactedWholeUrl in query.ts.
// 5. Userinfo after `//` or its backslash forms: redactTextUserinfo in text.ts, and in a query
//    pairsInUserinfoRuns in query-userinfo-runs.ts.
// 6. A listed key after `?`, `&`, `#` or `;` in text: redactTextQueryKeys in text.ts.
// 7. A url nested in the path: redactedPath in path.ts.
// buildUrlFull assembles url.full from 3 and 7, and failureMessage a span's status from 4 to 7.

export function redactHeaderCredential(name: string, value: string): string {
	return isCredentialHeaderName(name) || redactedWholeUrl(value) !== undefined || holdsUserinfoInAnyDecoding(value) || holdsListedKeyInAnyDecoding(value) ? "REDACTED" : value;
}

// The URL log.fetch traces: a scheme written without "//" parses to an opaque path, where
// userinfo, or a data: payload, sits in pathname and would ride into url.full.
export function traceableUrl(input: string | URL, baseHref: string | undefined): URL | undefined {
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
