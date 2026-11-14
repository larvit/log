import { percentDecoded } from "../credentials/decodings.js";
import { isCredentialHeaderName } from "../credentials/header-names.js";
import { redactedQuery, redactedWholeUrl } from "../credentials/query.js";
import { traceableUrl } from "../credentials/span-values.js";
import { isListedQueryKey } from "../credentials/text.js";
import test from "./tap.js";
import { withGlobals } from "./test-doubles.js";

const query = (search: string) => redactedQuery(new URL(`https://h.test/?${search}`));

test("percentDecoded decodes a multi-byte run whole, and keeps what is not ASCII of one that is not UTF-8", t => {
	t.strictEqual(percentDecoded("%E2%82%AC"), "€", "an escaped multi-byte character decodes as one");
	t.strictEqual(percentDecoded("%FF%2F"), "%FF/", "a run that is not UTF-8 keeps its non-ASCII escape and decodes its ASCII one");
	t.strictEqual(percentDecoded("%80"), "%80", "the first byte past ASCII stays escaped");
	t.strictEqual(percentDecoded("%FF%7F"), "%FF\u007F", "the last ASCII byte decodes");
	t.end();
});

test("isCredentialHeaderName lists cookie names exactly, and a name only holding one is kept", t => {
	t.ok(isCredentialHeaderName("Set-Cookie"), "set-cookie is listed");
	t.notOk(isCredentialHeaderName("cookie-policy"), "a name starting with an exact-only name is kept");
	t.notOk(isCredentialHeaderName("secretary"), "a name starting with an exact-only name is kept, secret's too");
	t.end();
});

test("isListedQueryKey lists code, googleaccessid and idtokenhint exactly", t => {
	t.ok(isListedQueryKey("code"), "code is listed");
	t.notOk(isListedQueryKey("codec"), "a key starting with an exact-only name is kept");
	t.notOk(isListedQueryKey("idtokenhinted"), "a key starting with an exact-only name is kept, idtokenhint's too");
	t.end();
});

test("traceableUrl returns undefined for text that parses as no url", t => {
	t.strictEqual(traceableUrl("not a url", undefined), undefined, "unparseable text");
	t.strictEqual(traceableUrl("ftp://h.test/", undefined), undefined, "a scheme other than http and https");
	t.strictEqual(traceableUrl("https://h.test/x", undefined)?.href, "https://h.test/x", "an https url");
	t.end();
});

test("redactedWholeUrl redacts userinfo of either half, and leaves a url holding no credential alone", t => {
	t.strictEqual(redactedWholeUrl("https://user@h.test/x"), "https://REDACTED@h.test/x", "a username alone");
	t.strictEqual(redactedWholeUrl("https://:pw@h.test/x"), "https://REDACTED@h.test/x", "a password alone");
	t.strictEqual(redactedWholeUrl("https://user:pw@h.test/x?q=1"), "https://REDACTED@h.test/x?q=1", "both halves, the password dropped whole");
	t.strictEqual(redactedWholeUrl("https://h.test/x?token=a"), "https://h.test/x?token=REDACTED", "a listed key, with no userinfo invented");
	t.strictEqual(redactedWholeUrl("https://h.test/x?q=1"), undefined, "no credential");
	t.strictEqual(redactedWholeUrl("not a url"), undefined, "no url");
	t.end();
});

test("redactedQuery reads each pair as a key and a value", t => {
	t.strictEqual(query("=//u:pw@h"), "=REDACTED", "a pair opening with = has an empty key, not the whole pair as its key");
	t.strictEqual(query("//u:pw+x@h.test/x=v"), "REDACTED=REDACTED", "userinfo in a key that a form-decoded + would cut short, found raw");
	t.strictEqual(query("//u:pw@h.test/x=REDACTED"), "REDACTED=REDACTED", "a key redacted beside a value that already reads REDACTED is a change");
	t.strictEqual(query("https:/u:pw@h.test=a%20b"), "REDACTED=REDACTED", "a url key read alone where its value breaks the joined reading");
	t.strictEqual(query("q=1&n=a%20b"), undefined, "no credential");
	t.end();
});

// The query of a url nested `levels` deep, its innermost query holding a key that opens a url the
// runtime cannot parse.
function nestedUnparseableKey(levels: number): string {
	let search = "https://[=1";

	for (let level = 2; level <= levels; level++) {
		search = `n=${encodeURIComponent(`https://h.test/?${search}`)}`;
	}

	return search;
}

test("redactedQuery keeps a url-opening key eight levels deep, and redacts one in the ninth", t => {
	t.strictEqual(query(nestedUnparseableKey(8)), undefined, "the eighth level is read as written");
	t.ok(query(nestedUnparseableKey(9))?.includes("REDACTED"), "past the nesting limit a url-opening key counts as holding a credential");
	t.end();
});

test("redactedQuery parses each part of a chain of nested url keys once", t => {
	const RealUrl = URL;
	let parses = 0;
	const CountingUrl = class extends URL {
		constructor(...args: ConstructorParameters<typeof URL>) {
			parses++;
			super(...args);
		}
	};
	let nested = "https://h.test/?x=1";

	for (let level = 1; level < 8; level++) {
		nested = `https://h.test/?${nested}`;
	}

	withGlobals({ URL: CountingUrl }, () => {
		t.strictEqual(redactedQuery(new RealUrl(`https://h.test/?${nested}`)), undefined, "no credential in the chain");
	});
	t.ok(parses > 0 && parses <= 50, `a chain of eight url keys costs a parse count that grows by level, not by branch: ${parses}`);
	t.end();
});
