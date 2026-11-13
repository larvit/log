import { formDecoded, percentDecoded, withoutDropped } from "./decodings.js";
import { holdsAtSignInAnyDecoding, pairsInUserinfoRuns } from "./query-userinfo-runs.js";
import { holdsListedKeyInAnyDecoding, holdsUserinfoInAnyDecoding, isListedQueryKey, SCHEME_LED } from "./text.js";

// Query parts parsed as a url, one inside the next; it also keeps the stack from running out. Past
// this limit a part counts as holding a credential, as decodings.ts says of every reading limit.
const MAX_NESTED_URLS = 8;

function parsedUrl(text: string): URL | undefined {
	try {
		return new URL(text);
	} catch {
		return undefined;
	}
}

const holdsUserinfo = (url: URL) => url.username !== "" || url.password !== "";

// The query's pairs raw, as typed: a `+`, `%2F`, `%3F` and `%23` stay inside userinfo here, where
// form-decoding turns them into a space and delimiters that end it. Like `searchParams`, it skips an
// empty pair.
function rawQueryPairs(url: URL): Array<[string, string]> {
	return url.search.slice(1).split("&").filter(pair => pair !== "").map((pair): [string, string] => {
		const equals = pair.indexOf("=");

		return equals < 0 ? [pair, ""] : [pair.slice(0, equals), pair.slice(equals + 1)];
	});
}

// One pair as two consumers read it: form-decoded, as `searchParams` hands it over, and raw, as typed.
interface QueryPair { key: string, rawKey: string, rawValue: string, value: string }

// How deep in nested urls a read is, and what the exported value's reads have found so far. The
// memo's key holds the depth, since a part read deeper meets MAX_NESTED_URLS sooner, so its reading
// may differ. The memo is kept because a url key is read alone and with its value, so a chain of
// such keys would re-read each level.
interface QueryReading { depth: number, memo: Map<string, string> }

const newReading = (): QueryReading => ({ depth: 0, memo: new Map() });

// redactedSearch, redactQueryPair and readNestedUrl call each other in a cycle, one turn per url
// nested in a query. It ends at a part that parses as no url, and `reading.depth` counts its turns and
// caps it. The eslint-disable line is the cycle's one call to a function declared further down.

// The part with its nested url's credentials redacted; the part as written where it parses as no url
// or its url holds none.
function readNestedUrl(part: string, reading: QueryReading): string {
	const memoKey = `${reading.depth} ${part}`;
	const known = reading.memo.get(memoKey);

	if (known !== undefined) {
		return known;
	}

	const url = parsedUrl(part);
	let read = part;

	if (url !== undefined && (reading.depth > MAX_NESTED_URLS || holdsUserinfo(url))) {
		read = "REDACTED";
	} else if (url !== undefined) {
		// eslint-disable-next-line @typescript-eslint/no-use-before-define
		const search = redactedSearch(url, reading);

		if (search !== undefined) {
			url.search = search;
			read = url.href;
		}
	}

	reading.memo.set(memoKey, read);

	return read;
}

type PairRedaction = "key and value" | "value";

// What one pair, read alone, loses. The first rule to answer decides, so reordering the rules changes
// what is redacted: each rule that redacts the key stands before any that keeps it. Userinfo spanning pairs or the `=`,
// as in `?//u:p=w@host`, is not theirs to find: `redactedSearch` redacts it first, with `pairsInUserinfoRuns`.
const PAIR_RULES: ReadonlyArray<(pair: QueryPair, reading: QueryReading) => PairRedaction | undefined> = [
	// A key opening a url that holds a credential, alone or joined to its value: a server taking
	// `?<url>` reads the pair as one url, where an `=` in a password ends the key.
	({ key, value }, reading) => {
		const joined = `${key}=${value}`;
		const opensUrl = SCHEME_LED.test(withoutDropped(key));

		return opensUrl && (reading.depth > MAX_NESTED_URLS || readNestedUrl(key, reading) !== key || readNestedUrl(joined, reading) !== joined) ? "key and value" : undefined;
	},
	// A credential in the key. Form-decoded and raw both: a `+` or an escaped delimiter ends the match
	// in one reading.
	({ key, rawKey }) => holdsUserinfoInAnyDecoding(key) || holdsUserinfoInAnyDecoding(rawKey) || holdsListedKeyInAnyDecoding(key) ? "key and value" : undefined,
	// A listed key, or userinfo in the value. It stands before the last rule, whose read of a url under
	// a listed key would keep that url.
	({ key, rawValue, value }) => isListedQueryKey(key) || holdsUserinfoInAnyDecoding(value) || holdsUserinfoInAnyDecoding(rawValue) ? "value" : undefined,
	// A listed key still in the value after its nested url is read: it sits where a url's own query
	// rules don't reach, such as a fragment.
	({ value }, reading) => holdsListedKeyInAnyDecoding(readNestedUrl(value, reading)) ? "value" : undefined,
];

function redactQueryPair(pair: QueryPair, reading: QueryReading): [string, string] {
	for (const rule of PAIR_RULES) {
		const redaction = rule(pair, reading);

		if (redaction !== undefined) {
			return [redaction === "value" ? pair.key : "REDACTED", "REDACTED"];
		}
	}

	// No rule answered: a url the runtime parses in the value has its listed keys redacted in place.
	return [pair.key, readNestedUrl(pair.value, reading)];
}

// The url's query with each credential redacted; `undefined` where no pair changes.
function redactedSearch(url: URL, reading: QueryReading): string | undefined {
	const raw = rawQueryPairs(url);
	const pairs = raw.map(([key, value]): [string, string] => [formDecoded(key), formDecoded(value)]);
	// Where a run of userinfo ends is read three ways, each as one consumer reads the query, and a pair
	// is redacted if any finds it; dropping a reading no test tells apart can only let a credential through. Raw, only
	// a literal delimiter ends a run and only a literal `@` counts: a `%2F` or `%40` there is no `/` or
	// `@`. Percent-decoded, an escaped delimiter ends a run and an escaped `@` counts, for a consumer
	// that decodes first; its `+` stays, since a parser takes it as part of the userinfo. Form-decoded,
	// as `searchParams` reads it, a `+` is a space and ends a run.
	const inRuns = new Set([
		...pairsInUserinfoRuns(pairs, holdsAtSignInAnyDecoding),
		...pairsInUserinfoRuns(raw.map(([key, value]): [string, string] => [percentDecoded(key), percentDecoded(value)]), holdsAtSignInAnyDecoding),
		...pairsInUserinfoRuns(raw, text => text.includes("@")),
	]);
	const deeper = { depth: reading.depth + 1, memo: reading.memo };
	const redacted = pairs.map(([key, value], index): [string, string] => inRuns.has(index) ? ["REDACTED", "REDACTED"] : redactQueryPair({ key, rawKey: raw[index][0], rawValue: raw[index][1], value }, deeper));

	return redacted.some(([key, value], index) => key !== pairs[index][0] || value !== pairs[index][1]) ? new URLSearchParams(redacted).toString() : undefined;
}

export const redactedQuery = (url: URL) => redactedSearch(url, newReading());

// A value the runtime's `URL` parses whole; `undefined` where it is none or holds nothing to redact.
export function redactedWholeUrl(value: string): string | undefined {
	const url = parsedUrl(value);
	const search = url === undefined ? undefined : redactedQuery(url);

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
