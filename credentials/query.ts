import { formDecoded, withoutDropped } from "./decodings.js";
import { holdsListedKeyInAnyDecoding, holdsUserinfoInAnyDecoding, isListedQueryKey, SCHEME_LED } from "./text.js";
import { pairsInUserinfoRunsOfAnyReading } from "./query-userinfo-runs.js";

// Query parts parsed as a url, one inside the next; it also keeps the stack from running out. Past
// this limit a part counts as holding a credential, as decodings.ts says of every reading limit.
const MAX_NESTED_URLS = 8;

function parsedUrl(text: string): URL | undefined {
	try {
		return new URL(text);
	} catch {
		// Without this line the catch ends the function, which returns `undefined` all the same: no test can tell the two apart.
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
interface QueryPair { formKey: string, formValue: string, rawKey: string, rawValue: string }

// Where a walk into nested urls has got to: how deep it is, and what each part read so far came to.
// The memo's key holds the depth, since a part read deeper meets MAX_NESTED_URLS sooner, so its result
// may differ. The memo is kept because a url key is read alone and with its value, so a chain of
// such keys would re-read each level.
interface NestedUrlWalk { depth: number, memo: Map<string, string> }

const newWalk = (): NestedUrlWalk => ({ depth: 0, memo: new Map() });

// redactedSearch, redactQueryPair and readNestedUrl call each other in a cycle, one turn per url
// nested in a query. It ends at a part that parses as no url, and `walk.depth` counts its turns and
// caps it. The eslint-disable line is the cycle's one call to a function declared further down.

// The part with its nested url's credentials redacted; the part as written where it parses as no url
// or its url holds none.
function readNestedUrl(part: string, walk: NestedUrlWalk): string {
	const memoKey = `${walk.depth} ${part}`;
	const known = walk.memo.get(memoKey);

	if (known !== undefined) {
		return known;
	}

	const url = parsedUrl(part);
	let read = part;

	if (url !== undefined && (walk.depth > MAX_NESTED_URLS || holdsUserinfo(url))) {
		read = "REDACTED";
	} else if (url !== undefined) {
		// eslint-disable-next-line @typescript-eslint/no-use-before-define
		const search = redactedSearch(url, walk);

		if (search !== undefined) {
			url.search = search;
			read = url.href;
		}
	}

	walk.memo.set(memoKey, read);

	return read;
}

// Whether a pair loses its key and its value. Any one of the conditions below is enough, in any order.
// Userinfo spanning pairs or the `=`, as in `?//u:p=w@host`, isn't found here: `redactedSearch`
// redacts it first, with `pairsInUserinfoRunsOfAnyReading`.
const redactsKeyAndValue = ({ formKey, formValue, rawKey }: QueryPair, walk: NestedUrlWalk): boolean => {
	// A key opening a url, alone or joined to its value, where that url holds a credential: a server
	// taking `?<url>` reads the pair as one url, where an `=` in a password ends the key.
	const joined = `${formKey}=${formValue}`;
	const opensUrlHoldingCredential = SCHEME_LED.test(withoutDropped(formKey)) && (walk.depth > MAX_NESTED_URLS || readNestedUrl(formKey, walk) !== formKey || readNestedUrl(joined, walk) !== joined);

	// A credential in the key. Form-decoded and raw both: a `+` or an escaped delimiter ends the match
	// in one reading.
	return opensUrlHoldingCredential || holdsUserinfoInAnyDecoding(formKey) || holdsUserinfoInAnyDecoding(rawKey) || holdsListedKeyInAnyDecoding(formKey);
};

// Whether a pair that `redactsKeyAndValue` keeps loses its value alone. Any one of the conditions
// below is enough, in any order.
const redactsValueOnly = ({ formKey, formValue, rawValue }: QueryPair, walk: NestedUrlWalk): boolean =>
	isListedQueryKey(formKey) || holdsUserinfoInAnyDecoding(formValue) || holdsUserinfoInAnyDecoding(rawValue)
	// A listed key still in the value after its nested url is read: it sits where a url's own query
	// rules don't reach, such as a fragment.
	|| holdsListedKeyInAnyDecoding(readNestedUrl(formValue, walk));

function redactQueryPair(pair: QueryPair, walk: NestedUrlWalk): [string, string] {
	if (redactsKeyAndValue(pair, walk)) {
		return ["REDACTED", "REDACTED"];
	}

	if (redactsValueOnly(pair, walk)) {
		return [pair.formKey, "REDACTED"];
	}

	// Neither: a url the runtime parses in the value has its listed keys redacted in place.
	return [pair.formKey, readNestedUrl(pair.formValue, walk)];
}

// The url's query with each credential redacted; `undefined` where no pair changes.
function redactedSearch(url: URL, walk: NestedUrlWalk): string | undefined {
	const raw = rawQueryPairs(url);
	const pairs = raw.map(([key, value]): [string, string] => [formDecoded(key), formDecoded(value)]);
	const inRuns = pairsInUserinfoRunsOfAnyReading(raw, pairs);
	const deeper = { depth: walk.depth + 1, memo: walk.memo };
	const redacted = pairs.map(([formKey, formValue], index): [string, string] => inRuns.has(index) ? ["REDACTED", "REDACTED"] : redactQueryPair({ formKey, formValue, rawKey: raw[index][0], rawValue: raw[index][1] }, deeper));

	return redacted.some(([key, value], index) => key !== pairs[index][0] || value !== pairs[index][1]) ? new URLSearchParams(redacted).toString() : undefined;
}

export const redactedQuery = (url: URL) => redactedSearch(url, newWalk());

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
