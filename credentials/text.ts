import { changesInAnyDecoding, withoutDropped } from "./decodings.js";

// Userinfo after `//`, and the same after `\\`, `/\` or `\/`: the patterns match a url among other text, or one
// the runtime cannot parse. After an opener holding a `\`, userinfo may not hold a `\`, so matching a
// long run of `\` stays linear. Only a `/`, `?` or `#` ends userinfo in WHATWG URL's authority state,
// as does a `\` in a special url, so a parser keeps a no-break space, a `\v` or a U+2028 in a
// password, and drops only a tab, newline or carriage return. A plain space ends it here all the same,
// so `see //host and mail a@b` stays as written. Each tail is one character class: a group of
// alternatives would overflow the regex stack on a message of megabytes.
const SLASHED_USERINFO = /(:?\/\/)[^/?# ]*@/g;
const BACKSLASH_OPENED_USERINFO = /(:?(?:\\[/\\]|\/\\))[^/\\?# ]*@/g;

export const OPENS_USERINFO = /\/\/[^/?# ]*$|(?:\\[/\\]|\/\\)[^/\\?# ]*$/;
export const redactTextUserinfo = (text: string) => text.replace(SLASHED_USERINFO, "$1REDACTED@").replace(BACKSLASH_OPENED_USERINFO, "$1REDACTED@");

const SENSITIVE_QUERY_KEY = /(auth|authentication|authorization|consumerid|credential|key|keyid|pass|passphrase|p(ass)?w(or)?d[12]?|secret|sig|sign|signature|signed|token)$|^(code|googleaccessid|idtokenhint)$/;

export function isListedQueryKey(key: string): boolean {
	return SENSITIVE_QUERY_KEY.test(key.toLowerCase().replace(/[-_]/g, ""));
}

// The text with each listed key's value replaced by `REDACTED`, wherever a url's own query rules don't
// reach it: a status message such as `request to …?token=… failed`, a relative `location`, a
// scheme-less url, a `?` in a fragment, a fragment's own pairs such as an OAuth redirect's
// `#access_token=…`, a matrix parameter such as `/img;sig=…`. A key is whatever stands between its
// `?`, `&`, `#` or `;` and its `=`, a space included, so a listed key after a `?` in an unlisted value
// is found. A key starts after the nearest of the four, so `code`, which only an exact name lists, is
// found in `?#code=…` and `?x#code=…`. A value may hold a `?` and ends at `&`, `#` or a plain space.
export function redactTextQueryKeys(text: string): string {
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
			valueEnd.lastIndex = opener.lastIndex;

			const end = valueEnd.exec(text)?.index ?? text.length;

			redacted += `${text.slice(copied, opener.lastIndex)}REDACTED`;
			copied = end;
		}
	}

	return redacted + text.slice(copied);
}

export const holdsUserinfoInAnyDecoding = (text: string) => changesInAnyDecoding(text, redactTextUserinfo);
export const holdsListedKey = (text: string) => redactTextQueryKeys(text) !== text;
export const holdsListedKeyInAnyDecoding = (text: string) => changesInAnyDecoding(text, redactTextQueryKeys);

// A parser drops leading C0 controls and spaces, and a tab or newline anywhere.
export const SCHEME_LED = /^[\0- ]*[a-z][a-z\d+.-]*:/i;
