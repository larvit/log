import { holdsListedKeyInAnyDecoding, holdsUserinfoInAnyDecoding, redactTextQueryKeys, redactTextUserinfo } from "./text.js";
import { isCredentialHeaderName } from "./header-names.js";
import { redactedPath } from "./path.js";
import { redactedQuery, redactedWholeUrl } from "./query.js";
import { stringField } from "../primitives/field-reads.js";

// Where README → Credentials in a captured value is enforced, bullet by bullet:
// 1. A credential header name: isCredentialHeaderName in header-names.ts, applied by redactHeaderCredential.
// 2. A listed query key: isListedQueryKey and redactTextQueryKeys in text.ts, applied by NestedQueryReader.pair in query.ts.
// 3. A url in a kept query value or key: NestedQueryReader in query.ts.
// 4. A url that parses whole, in a header value or status message: redactedWholeUrl in query.ts.
// 5. Userinfo after `//` or its backslash forms: redactTextUserinfo in text.ts, and in a query
//    pairsInUserinfoRunsOfAnyReading in query-userinfo-runs.ts.
// 6. A listed key after `?`, `&`, `#` or `;` in text: redactTextQueryKeys in text.ts.
// 7. A url nested in the path: redactedPath in path.ts.
// buildUrlFull assembles url.full from 3 and 7, failureMessage a span's status from 4 to 7, and
// redactedRecordedAttribute what an OpenTelemetry instrumentation recorded from 1 to 7.

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

// A recorded path, query or fragment is read as a url on this made-up origin.
const RELATIVE_BASE = "http://relative.invalid";

// OpenTelemetry's semantic conventions write these attributes without the `?` or `#` that opens them,
// where the text rules find a pair only after one.
const OPENER_LEFT_OUT = new Map([["url.fragment", "#"], ["url.query", "?"]]);
const HEADER_ATTRIBUTE = /http\.(?:request|response)\.header\.(.+)/;

// `text` read as a url after `base`, with `base` taken off again; `undefined` where it is no http: or
// https: url, or holds nothing to redact.
function redactedAsUrl(text: string, base: string): string | undefined {
	const url = parseHttpUrl(base + text, undefined);

	if (url === undefined) {
		return undefined;
	}

	const redacted = failureMessage(url.href, url);

	if (redacted === url.href) {
		return undefined;
	}

	return redacted.startsWith(base) ? redacted.slice(base.length) : redacted;
}

// A span name, status message or attribute value an OpenTelemetry instrumentation recorded. A value
// with nothing to redact stays as recorded, unnormalised.
export function redactedRecordedValue(value: string): string {
	// Appended, not resolved, so a path opening with `//` stays a path rather than naming a host.
	const base = value.startsWith("/") ? RELATIVE_BASE : /^[?#]/.test(value) ? `${RELATIVE_BASE}/` : "";

	// Where the url reading finds nothing, the text is read as written: parsing drops a `..` segment,
	// and a credential before it. Text rules see userinfo only raw, so one a decoding still holds, as
	// in a nested url they don't parse, takes the whole value, as in a header value.
	const redacted = redactedAsUrl(value, base) ?? failureMessage(value);

	return holdsUserinfoInAnyDecoding(redacted) ? "REDACTED" : redacted;
}

export function redactedRecordedAttribute(key: string, value: string): string {
	const header = HEADER_ATTRIBUTE.exec(key);

	if (header !== null) {
		// OpenTelemetry's older conventions write a header name with `_` for `-`, as `set_cookie`.
		return redactHeaderCredential(header[1].replace(/_/g, "-"), value);
	}

	const opener = OPENER_LEFT_OUT.get(key);

	if (opener === undefined) {
		return redactedRecordedValue(value);
	}

	const redacted = redactedRecordedValue(opener + value);

	return redacted.startsWith(opener) ? redacted.slice(opener.length) : redacted;
}
