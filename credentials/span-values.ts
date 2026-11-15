import { holdsListedKeyInAnyDecoding, holdsUserinfoInAnyDecoding, redactTextQueryKeys, redactTextUserinfo } from "./text.js";
import { isCredentialHeaderName } from "./header-names.js";
import { parseHttpUrl } from "./url-full.js";
import { redactedPath } from "./path.js";
import { redactedWholeUrl } from "./query.js";
import { stringField } from "../primitives/field-reads.js";

// Where README → Credentials in a captured value is enforced, bullet by bullet:
// 1. A credential header name: isCredentialHeaderName in header-names.ts, applied by redactHeaderCredential.
// 2. A listed query key: isListedQueryKey in query-key.ts and redactTextQueryKeys in text.ts, applied by NestedQueryReader.pair in query.ts.
// 3. A url in a kept query value or key: NestedQueryReader in query.ts.
// 4. A url that parses whole, in a header value or status message: redactedWholeUrl in query.ts.
// 5. Userinfo after `//` or its backslash forms: redactTextUserinfo in text.ts, and in a query
//    pairsInUserinfoRunsOfAnyReading in query-userinfo-runs.ts and NestedQueryReader.pair in query.ts.
// 6. A listed key after `?`, `&`, `#` or `;` in text: redactTextQueryKeys in text.ts.
// 7. A url nested in the path: redactedPath in path.ts.
// buildUrlFull in url-full.ts assembles url.full from 3 and 7. redactedText applies 4 to 7 to a text:
// failureMessage for a span's status, redactedRecordedAttribute, from 1 to 7, for what an
// OpenTelemetry instrumentation recorded.

export function redactHeaderCredential(name: string, value: string): string {
	return isCredentialHeaderName(name) || redactedWholeUrl(value) !== undefined || holdsUserinfoInAnyDecoding(value) || holdsListedKeyInAnyDecoding(value) ? "REDACTED" : value;
}

// `text` with each credential rule of 4 to 7 above applied, `url` being a known url that `text` may quote.
function redactedText(text: string, url?: URL): string {
	// Precise rules first, coarse after, so each coarse rule sees only what the finer ones left. First,
	// the known url, which the runtime quotes back: Firefox's `Window.fetch: <url> …` parses whole, its
	// quoted userinfo in the path.
	let quoted = text;

	if (url !== undefined) {
		const known = new URL(redactedWholeUrl(url.href) ?? url.href);

		known.pathname = redactedPath(url.pathname);
		quoted = text.split(url.href).join(known.href);
	}

	// Then the text as one url, then free text.
	const keyed = redactTextQueryKeys(redactTextUserinfo(redactedWholeUrl(quoted) ?? quoted));

	// Last, a listed key that only a decoding spells is beyond the text rules, so the text goes.
	return holdsListedKeyInAnyDecoding(keyed) ? "REDACTED" : keyed;
}

// The text of an error, as a span's status message. `url` is the one log.fetch handed the runtime, which
// quotes it back inside free text.
export function failureMessage(error: unknown, url?: URL): string {
	let message = stringField(error, "message");

	if (message === undefined) {
		try {
			message = String(error);
		} catch {
			message = "_OTHER";
		}
	}

	return redactedText(message, url);
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

	const redacted = redactedText(url.href, url);

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
	const redacted = redactedAsUrl(value, base) ?? redactedText(value);

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
