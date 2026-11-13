import { stringField } from "../primitives/failure-fields.js";

// Where README → Credentials in a captured value is enforced, bullet by bullet:
// 1. A credential header name: isCredentialHeaderName, applied by redactHeaderCredential.
// 2. A listed query key: isListedQueryKey and redactTextQueryKeys, applied by redactQueryPair.
// 3. A url in a kept query value or key: redactedSearch, with redactQueryPart, readQueryPart and redactQueryPair.
// 4. A url that parses whole, in a header value or status message: redactedWholeUrl.
// 5. Userinfo after `//` or its backslash forms: redactTextUserinfo in text, pairsInUserinfoRuns in a query.
// 6. A listed key after `?`, `&`, `#` or `;` in text: redactTextQueryKeys.
// 7. A url nested in the path: redactedPath.
// buildUrlFull assembles url.full from 3 and 7, and failureMessage a span's status from 4 to 7.

// One rule for the credential headers a span redacts and a send warns of. Elastic APM's default `sanitize_field_names`, plus the spec's optional `cookie`.
const SENSITIVE_HEADER_NAME = /^(cookie|passwd|password|pwd|secret|set-cookie)$|key$|auth|card|credit|principal|session|token/;

export function isCredentialHeaderName(name: string): boolean {
	return SENSITIVE_HEADER_NAME.test(name.toLowerCase());
}

// Reading limits, each bounding the work one value costs. Past a limit, the value counts as holding
// a credential, so a limit can only redact more, never let a credential through.

// Percent-decodings of one text.
const MAX_PERCENT_DECODINGS = 8;
// Query parts parsed as a url, one inside the next; it also keeps the stack from running out.
const MAX_NESTED_URLS = 8;
// Path segments opening a url, each read with the rest of the path.
const MAX_SCHEME_SEGMENTS = 8;

// The decodings of a text encoded past MAX_PERCENT_DECODINGS: no reading is left to test.
const UNREADABLE = Symbol("unreadable");

type Decodings = string[] | typeof UNREADABLE;

// Text encoded past MAX_PERCENT_DECODINGS holds whatever a reader tests for.
const inAnyDecoding = (readings: Decodings, test: (decoding: string) => boolean) => readings === UNREADABLE || readings.some(test);

// A part's reading by depth, kept for one exported value: a url key is read alone and with its
// value, so a chain of them would re-read each level.
type PartsRead = Map<string, string>;

function parsedUrl(text: string): URL | undefined {
	try {
		return new URL(text);
	} catch {
		return undefined;
	}
}

const holdsUserinfo = (url: URL) => url.username !== "" || url.password !== "";

// Userinfo after `//`, and the same after `\\`, `/\` or `\/`: the patterns match a url among other text, or one
// the runtime cannot parse. After an opener holding a `\`, userinfo may not hold a `\`, so matching a
// long run of `\` stays linear. Only a `/`, `?` or `#` ends userinfo in WHATWG URL's authority state,
// as does a `\` in a special url, so a parser keeps a no-break space, a `\v` or a U+2028 in a
// password, and drops only a tab, newline or carriage return. A plain space ends it here all the same,
// so `see //host and mail a@b` stays as written. Each tail is one character class: a group of
// alternatives would overflow the regex stack on a message of megabytes.
const SLASHED_USERINFO = /(:?\/\/)[^/?# ]*@/g;
const BACKSLASH_OPENED_USERINFO = /(:?(?:\\[/\\]|\/\\))[^/\\?# ]*@/g;
const OPENS_USERINFO = /\/\/[^/?# ]*$|(?:\\[/\\]|\/\\)[^/\\?# ]*$/;
const redactTextUserinfo = (text: string) => text.replace(SLASHED_USERINFO, "$1REDACTED@").replace(BACKSLASH_OPENED_USERINFO, "$1REDACTED@");

// Run by run, never the whole string: decodeURIComponent throws on the first invalid escape.
function percentDecoded(value: string): string {
	return value.replace(/(?:%[0-9A-Fa-f]{2})+/g, run => {
		try {
			return decodeURIComponent(run);
		} catch {
			// Only ASCII spells a url delimiter, so keep a non-UTF-8 run's ASCII and leave the rest.
			return run.replace(/%([0-9A-Fa-f]{2})/g, (escape, hex: string) => parseInt(hex, 16) < 0x80 ? String.fromCharCode(parseInt(hex, 16)) : escape);
		}
	});
}

// Every decoding: decoding a `%2F` inside userinfo puts a `/` before the `@`, so a match in one
// decoding can vanish in the next.
function decodings(text: string): Decodings {
	const readings = [text];

	for (let decoded = percentDecoded(text); decoded !== readings[readings.length - 1]; decoded = percentDecoded(decoded)) {
		if (readings.length > MAX_PERCENT_DECODINGS) {
			return UNREADABLE;
		}

		readings.push(decoded);
	}

	return readings;
}

// A parser drops a tab, newline or carriage return: `si%09g` reads as `sig`.
const withoutDropped = (text: string) => text.replace(/[\t\n\r]/g, "");

const SENSITIVE_QUERY_KEY = /(auth|authentication|authorization|consumerid|credential|key|keyid|pass|passphrase|p(ass)?w(or)?d[12]?|secret|sig|sign|signature|signed|token)$|^(code|googleaccessid|idtokenhint)$/;

function isListedQueryKey(key: string): boolean {
	return SENSITIVE_QUERY_KEY.test(key.toLowerCase().replace(/[-_]/g, ""));
}

// The text with each listed key's value replaced by `REDACTED`, wherever a url's own query rules don't
// reach it: a status message such as `request to …?token=… failed`, a relative `location`, a
// scheme-less url, a `?` in a fragment, a fragment's own pairs such as an OAuth redirect's
// `#access_token=…`, a matrix parameter such as `/img;sig=…`. A key is whatever stands between its
// `?`, `&`, `#` or `;` and its `=`, a space included, so a listed key after a `?` in an unlisted value
// is found. A key starts after the nearest of the four, so `code`, which only an exact name lists, is
// found in `?#code=…` and `?x#code=…`. A value may hold a `?` and ends at `&`, `#` or a plain space.
function redactTextQueryKeys(text: string): string {
	const opener = /[?&#;]([^&=?#;]*)=/g;
	const valueEnd = /[&# ]/g;
	let redacted = "";
	let copied = 0;

	// `opener.lastIndex` is just past the `=` of the pair found, and `copied` is where the text still to
	// copy begins: past the last value redacted.
	for (let pair = opener.exec(text); pair !== null; pair = opener.exec(text)) {
		// A pair whose `=` falls inside a value already redacted is part of it. One that only opens there,
		// a key holding a space after a `?` in the value, is found: scanning goes on from each `=`.
		const insideRedactedValue = opener.lastIndex <= copied;

		if (!insideRedactedValue && isListedQueryKey(withoutDropped(pair[1]))) {
			// Both regexes are global, so the search for the value's end starts at this `lastIndex`.
			valueEnd.lastIndex = opener.lastIndex;

			const end = valueEnd.exec(text)?.index ?? text.length;

			redacted += `${text.slice(copied, opener.lastIndex)}REDACTED`;
			copied = end;
		}
	}

	return redacted + text.slice(copied);
}

const changesInAnyDecoding = (text: string, redact: (decoding: string) => string) => inAnyDecoding(decodings(text), decoding => redact(decoding) !== decoding);

const holdsUserinfoInAnyDecoding = (text: string) => changesInAnyDecoding(text, redactTextUserinfo);
const holdsListedKey = (text: string) => redactTextQueryKeys(text) !== text;
const holdsListedKeyInAnyDecoding = (text: string) => changesInAnyDecoding(text, redactTextQueryKeys);

const URL_DELIMITER = /[/?# ]/;

// Whether a `//`, `\\`, `/\` or `\/` at the key's end, in any decoding, opens userinfo.
const opensUserinfo = (key: string) => inAnyDecoding(decodings(key), decoding => OPENS_USERINFO.test(decoding));

// A parser reads the `&` in `?//u:p&w@host` as part of the userinfo, which the query splits into
// two pairs. A key opening userinfo starts a run: its value and each later pair join it, up to the
// first URL_DELIMITER. The indexes of the pairs up to the run's last `@` are returned, for the caller
// to redact whole. Keep `\` out of
// URL_DELIMITER, since userinfo after `//` may hold one; a run that a backslash opens may then redact
// a pair holding no credential. A value opening userinfo is a url of its own, so
// `?next=https://h&q=a@b` is kept.
function pairsInUserinfoRuns(pairs: Array<[string, string]>, holdsAtSign: (text: string) => boolean): Set<number> {
	const inRuns = new Set<number>();
	let start = -1;
	let end = -1;

	const close = () => {
		for (let index = start; index <= end; index++) {
			inRuns.add(index);
		}

		start = -1;
		end = -1;
	};
	const read = (part: string, index: number) => {
		const cut = part.search(URL_DELIMITER);

		if (holdsAtSign(cut < 0 ? part : part.slice(0, cut))) {
			end = index;
		}

		if (cut >= 0) {
			close();
		}
	};

	pairs.forEach(([key, value], index) => {
		// Both ifs can fire on one pair: the first can end the open run at this pair's delimiter, and the
		// second then opens a new run on the same pair.
		if (start >= 0) {
			read(`${key}=${value}`, index);
		}

		if (start < 0 && opensUserinfo(key)) {
			start = index;
			// The whole pair: `read` stops at the first delimiter, so it misses the `//x@` in a value such
			// as `ss//x@h`, which `?//u:p=ss%2F%2Fx@h` decodes to.
			end = holdsUserinfoInAnyDecoding(`${key}=${value}`) ? index : -1;
			read(value, index);
		}
	});

	if (start >= 0) {
		close();
	}

	return inRuns;
}

// The query's pairs raw, as typed: a `+`, `%2F`, `%3F` and `%23` stay inside userinfo here, where
// form-decoding turns them into a space and delimiters that end it. Like `searchParams`, it skips an
// empty pair.
function rawQueryPairs(url: URL): Array<[string, string]> {
	return url.search.slice(1).split("&").filter(pair => pair !== "").map((pair): [string, string] => {
		const equals = pair.indexOf("=");

		return equals < 0 ? [pair, ""] : [pair.slice(0, equals), pair.slice(equals + 1)];
	});
}

const formDecoded = (text: string) => new URLSearchParams(`=${text}`).get("") ?? "";
const holdsAtSignInAnyDecoding = (text: string) => inAnyDecoding(decodings(text), decoding => decoding.includes("@"));

// redactedSearch, redactQueryPair, redactQueryPart and readQueryPart call each other in a cycle, once
// per url nested in a query; the eslint-disable lines below are that cycle. `depth` counts its turns and
// is what ends it: past MAX_NESTED_URLS a url counts as holding a credential. `partsRead` is its memo.

// `undefined` where no pair changes.
function redactedSearch(url: URL, depth: number, partsRead: PartsRead): string | undefined {
	const raw = rawQueryPairs(url);
	const pairs = raw.map(([key, value]): [string, string] => [formDecoded(key), formDecoded(value)]);
	// Where a run of userinfo ends is read three ways, and a pair is redacted if any finds it. Raw, only
	// a literal delimiter ends a run and only a literal `@` counts: a `%2F` or `%40` there is no `/` or
	// `@`. Percent-decoded, an escaped delimiter ends a run and an escaped `@` counts, for a consumer
	// that decodes first; its `+` stays, since a parser takes it as part of the userinfo. Form-decoded,
	// as `searchParams` reads it, a `+` is a space and ends a run.
	const inRuns = new Set([
		...pairsInUserinfoRuns(pairs, holdsAtSignInAnyDecoding),
		...pairsInUserinfoRuns(raw.map(([key, value]): [string, string] => [percentDecoded(key), percentDecoded(value)]), holdsAtSignInAnyDecoding),
		...pairsInUserinfoRuns(raw, text => text.includes("@")),
	]);
	// eslint-disable-next-line @typescript-eslint/no-use-before-define
	const redacted = pairs.map(([key, value], index): [string, string] => inRuns.has(index) ? ["REDACTED", "REDACTED"] : redactQueryPair(key, value, raw[index], depth + 1, partsRead));

	return redacted.some(([key, value], index) => key !== pairs[index][0] || value !== pairs[index][1]) ? new URLSearchParams(redacted).toString() : undefined;
}

// The memo's key holds the depth: a part read deeper meets the MAX_NESTED_URLS limit sooner, so its
// reading may differ.
function redactQueryPart(part: string, depth: number, partsRead: PartsRead): string {
	const readKey = `${depth} ${part}`;
	// eslint-disable-next-line @typescript-eslint/no-use-before-define
	const read = partsRead.get(readKey) ?? readQueryPart(part, depth, partsRead);

	partsRead.set(readKey, read);

	return read;
}

function readQueryPart(part: string, depth: number, partsRead: PartsRead): string {
	const url = parsedUrl(part);

	if (url === undefined) {
		return part;
	}

	if (depth > MAX_NESTED_URLS || holdsUserinfo(url)) {
		return "REDACTED";
	}

	const search = redactedSearch(url, depth, partsRead);

	if (search === undefined) {
		return part;
	}

	url.search = search;

	return url.href;
}

// A parser drops leading C0 controls and spaces, and a tab or newline anywhere.
const SCHEME_LED = /^[\0- ]*[a-z][a-z\d+.-]*:/i;

// A key opening a url is read with its value too, as a server taking `?<url>` reads it: an `=` in its
// password ends the key. This function reads one pair alone, so userinfo spanning pairs or the `=`,
// as in `?//u:p=w@host`, is for the caller to redact first, as `redactedSearch` does with
// `pairsInUserinfoRuns`.
// The exits run from the widest redaction to the narrowest, and that order is load-bearing: the first
// two redact the key too, and each later exit keeps the key, so a key holding a credential must be
// caught before any of them.
function redactQueryPair(key: string, value: string, [rawKey, rawValue]: [string, string], depth: number, partsRead: PartsRead): [string, string] {
	// Exit 1, key and value: a key opening a url that holds a credential, alone or joined to its value.
	if (SCHEME_LED.test(withoutDropped(key))) {
		const joined = `${key}=${value}`;

		if (depth > MAX_NESTED_URLS || redactQueryPart(key, depth, partsRead) !== key || redactQueryPart(joined, depth, partsRead) !== joined) {
			return ["REDACTED", "REDACTED"];
		}
	}

	// Exit 2, key and value: a credential in the key. Form-decoded and raw both: a `+` or an escaped
	// delimiter ends the match in one reading.
	if (holdsUserinfoInAnyDecoding(key) || holdsUserinfoInAnyDecoding(rawKey) || holdsListedKeyInAnyDecoding(key)) {
		return ["REDACTED", "REDACTED"];
	}

	// Exit 3, the value: the key is listed, or the value holds userinfo.
	if (isListedQueryKey(key) || holdsUserinfoInAnyDecoding(value) || holdsUserinfoInAnyDecoding(rawValue)) {
		return [key, "REDACTED"];
	}

	// Exits 4 and 5, the value: a url the runtime parses has its listed keys redacted in place (4); a
	// listed key still left in the result sits where its query rules don't reach, such as a fragment (5).
	const part = redactQueryPart(value, depth, partsRead);

	return [key, holdsListedKeyInAnyDecoding(part) ? "REDACTED" : part];
}

// A value the runtime's `URL` parses whole; `undefined` where it is none or holds nothing to redact.
function redactedWholeUrl(value: string): string | undefined {
	const url = parsedUrl(value);
	const search = url === undefined ? undefined : redactedSearch(url, 0, new Map());

	if (url === undefined || (!holdsUserinfo(url) && search === undefined)) {
		return undefined;
	}

	if (holdsUserinfo(url)) {
		url.username = "REDACTED";
		url.password = "";
	}

	url.search = search ?? url.search;

	return url.href;
}

export function redactHeaderCredential(name: string, value: string): string {
	return isCredentialHeaderName(name) || redactedWholeUrl(value) !== undefined || holdsUserinfoInAnyDecoding(value) || holdsListedKeyInAnyDecoding(value) ? "REDACTED" : value;
}

// The page's address, which a relative url resolves against; undefined outside a browser, or where the getter throws.
export function pageHref(): string | undefined {
	try {
		return (globalThis as { location?: { href?: string } }).location?.href;
	} catch {
		return undefined;
	}
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

// Cut at the first segment whose nested url holds a credential: a later cut would leave an earlier
// url's userinfo in the kept prefix. A url nested with no scheme, or behind other text in its segment,
// still carries a query, so a segment holding a listed key cuts too.
function redactedPath(pathname: string): string {
	const segments = pathname.split("/");
	const read = segments.map(segment => decodings(segment));

	if (read.includes(UNREADABLE)) {
		return "/REDACTED";
	}

	// A listed key cuts the path at its segment. A url opened in an earlier segment may cut it sooner.
	const listedKeyAt = read.findIndex(segmentRead => inAnyDecoding(segmentRead, holdsListedKey));
	// Segments before `cutAt` are kept, and `REDACTED` replaces the rest; -1 keeps all.
	let cutAt = listedKeyAt;
	let opened = 0;

	// Segment 0 is the empty text before the leading `/`, which opens no url, so the scan starts at 1.
	for (let index = 1; index < (listedKeyAt === -1 ? segments.length : listedKeyAt); index++) {
		if (!inAnyDecoding(read[index], decoding => SCHEME_LED.test(decoding))) {
			continue;
		}

		opened++;

		const nested = decodings(segments.slice(index).join("/"));

		if (opened > MAX_SCHEME_SEGMENTS || inAnyDecoding(nested, decoding => SCHEME_LED.test(decoding) && (redactedWholeUrl(decoding) !== undefined || redactTextUserinfo(decoding) !== decoding))) {
			cutAt = index;
			break;
		}
	}

	const kept = cutAt === -1 ? pathname : [...segments.slice(0, cutAt), "REDACTED"].join("/");

	// Userinfo after `//`, `\\`, `/\` or `\/` needs no scheme and no query key, so both cuts can miss it.
	// That userinfo may sit in a decoding that maps to no raw segment, so the whole path goes, whatever
	// the cuts kept.
	return holdsUserinfoInAnyDecoding(kept) ? "/REDACTED" : kept;
}

// `url.origin` omits userinfo, which is what keeps the outer url's credentials off the span.
export function buildUrlFull(url: URL, captureQuery: boolean): string {
	const base = url.origin + redactedPath(url.pathname);

	return !captureQuery || !url.search ? base : `${base}?${redactedSearch(url, 0, new Map()) ?? url.searchParams.toString()}`;
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

	// Precise rules first, coarse after, so each coarse rule sees only what the finer ones left.
	// 1. The known url, which the runtime quotes back: Firefox's `Window.fetch: <url> …` parses whole, its
	// quoted userinfo in the path.
	let quoted = message;

	if (url !== undefined) {
		const known = new URL(redactedWholeUrl(url.href) ?? url.href);

		known.pathname = redactedPath(url.pathname);
		quoted = message.split(url.href).join(known.href);
	}

	// 2. The message as one url, then userinfo and listed keys in free text.
	const keyed = redactTextQueryKeys(redactTextUserinfo(redactedWholeUrl(quoted) ?? quoted));

	// 3. A listed key that only a decoding spells is beyond the text rules, so the message goes.
	return holdsListedKeyInAnyDecoding(keyed) ? "REDACTED" : keyed;
}
