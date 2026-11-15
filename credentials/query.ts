import { formDecoded, withoutDropped } from "./decodings.js";
import { holdsListedKeyInAnyDecoding, holdsUserinfoInAnyDecoding, isListedQueryKey, opensUserinfoInAnyDecoding, SCHEME_LED } from "./text.js";
import { pairsInUserinfoRunsOfAnyReading } from "./query-userinfo-runs.js";

// A query is read level by level: a part holding a url is read as that url, whose own query is read
// the same way one level down. A part's level counts the urls it sits in, so a part of the query
// `redactedQuery` is handed is at level 1. Past this limit a part opening a url counts as holding a
// credential, parsed or not, as decodings.ts says of every reading limit; the limit also keeps the
// stack from running out.
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
interface QueryPair { formKey: string, formValue: string, rawKey: string, rawValue: string }

// Userinfo the key opens running on past the `=` into the value, as in `?//u:p=w@host`.
const holdsUserinfoAcrossEquals = (key: string, value: string) => opensUserinfoInAnyDecoding(key) && holdsUserinfoInAnyDecoding(`${key}=${value}`);

// Reads one query and every url nested in it. It remembers each part it has read, since a url key is
// read alone and joined to its value, and in a chain of such keys both readings meet the same parts.
// The level is part of what it remembers: a part read deeper meets MAX_NESTED_URLS sooner.
class NestedQueryReader {
	private readonly partsRead = new Map<string, string>();

	// The url's query with each credential redacted, its parts read at `level`; `undefined` where no
	// pair changes.
	search(url: URL, level: number): string | undefined {
		const raw = rawQueryPairs(url);
		const pairs = raw.map(([rawKey, rawValue]): QueryPair => ({ formKey: formDecoded(rawKey), formValue: formDecoded(rawValue), rawKey, rawValue }));
		// Userinfo running across an `&`, as in `?//u:p&w@host`, which no single pair holds.
		const inRuns = pairsInUserinfoRunsOfAnyReading(raw, pairs.map(({ formKey, formValue }): [string, string] => [formKey, formValue]));
		const redacted = pairs.map((pair, index): [string, string] => inRuns.has(index) ? ["REDACTED", "REDACTED"] : this.pair(pair, level));

		return redacted.some(([key, value], index) => key !== pairs[index].formKey || value !== pairs[index].formValue) ? new URLSearchParams(redacted).toString() : undefined;
	}

	// One pair, redacted by the bullets of README → Credentials in a captured value. Each condition
	// below names the bullet it serves; any one is enough. Raw and form-decoded both, where a `+` or an
	// escaped delimiter would end userinfo in one reading.
	pair({ formKey, formValue, rawKey, rawValue }: QueryPair, level: number): [string, string] {
		const joined = `${formKey}=${formValue}`;
		const keyHoldsCredential =
			// "A url in a kept query value": a url in the key, read alone and joined to its value, since a
			// server taking `?<url>` reads the pair as one url, where an `=` in a password ends the key.
			this.part(formKey, level) !== formKey || this.part(joined, level) !== joined
			// "Userinfo after `//`…": in the key, or opened by it and running on into the value.
			|| holdsUserinfoInAnyDecoding(formKey) || holdsUserinfoInAnyDecoding(rawKey)
			|| holdsUserinfoAcrossEquals(formKey, formValue) || holdsUserinfoAcrossEquals(rawKey, rawValue)
			// "A matched query key and its `=`…": a listed key inside the key.
			|| holdsListedKeyInAnyDecoding(formKey);

		if (keyHoldsCredential) {
			return ["REDACTED", "REDACTED"];
		}

		const value = this.part(formValue, level);
		const valueHoldsCredential =
			// "The value of a query key…": the key is listed.
			isListedQueryKey(formKey)
			// "Userinfo after `//`…".
			|| holdsUserinfoInAnyDecoding(formValue) || holdsUserinfoInAnyDecoding(rawValue)
			// "A matched query key and its `=`…": a listed key still in the value once its url is read,
			// where that url's own query rules don't reach it, such as in a fragment.
			|| holdsListedKeyInAnyDecoding(value);

		// Neither: "A url in a kept query value" has its own credentials redacted in place.
		return valueHoldsCredential ? [formKey, "REDACTED"] : [formKey, value];
	}

	// The part with the credentials of the url it opens redacted; the part as written where it opens
	// no url, or its url holds none.
	part(text: string, level: number): string {
		const memoKey = `${level} ${text}`;
		const known = this.partsRead.get(memoKey);

		if (known !== undefined) {
			return known;
		}

		const read = this.readPart(text, level);

		this.partsRead.set(memoKey, read);

		return read;
	}

	private readPart(text: string, level: number): string {
		if (level > MAX_NESTED_URLS) {
			return SCHEME_LED.test(withoutDropped(text)) ? "REDACTED" : text;
		}

		const url = parsedUrl(text);

		if (url === undefined) {
			return text;
		}

		if (holdsUserinfo(url)) {
			return "REDACTED";
		}

		const search = this.search(url, level + 1);

		if (search === undefined) {
			return text;
		}

		url.search = search;

		return url.href;
	}
}

export const redactedQuery = (url: URL) => new NestedQueryReader().search(url, 1);

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
