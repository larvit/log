import { isCredentialHeaderName } from "../credentials/header-names.js";
import { isListedQueryKey } from "../credentials/text.js";
import { parseHttpUrl } from "../credentials/span-values.js";
import { percentDecoded } from "../credentials/decodings.js";
import { redactedQuery, redactedWholeUrl } from "../credentials/query.js";
import test from "./tap.js";
import { withGlobals } from "./test-doubles.js";

const query = (search: string) => redactedQuery(new URL(`https://h.test/?${search}`));

test("percentDecoded decodes a multi-byte run whole, and a run that is not UTF-8 escape by escape, keeping its non-ASCII escapes", t => {
	t.strictEqual(percentDecoded("%E2%82%AC"), "€", "an escaped multi-byte character decodes as one");
	t.strictEqual(percentDecoded("%FF%2F"), "%FF/", "a run that is not UTF-8 keeps its non-ASCII escape and decodes its ASCII one");
	t.strictEqual(percentDecoded("%80"), "%80", "the first byte past ASCII stays escaped");
	t.strictEqual(percentDecoded("%FF%7F"), "%FF\u007F", "the last ASCII byte decodes");
	t.end();
});

test("isCredentialHeaderName matches an exact-only name whole, never as a prefix", t => {
	t.ok(isCredentialHeaderName("Set-Cookie"), "set-cookie is listed");
	t.notOk(isCredentialHeaderName("cookie-policy"), "a name starting with an exact-only name is kept");
	t.notOk(isCredentialHeaderName("secretary"), "a name starting with secret is kept");
	t.end();
});

test("isListedQueryKey matches code, googleaccessid and idtokenhint whole, never as a prefix", t => {
	t.ok(isListedQueryKey("code"), "code is listed");
	t.notOk(isListedQueryKey("codec"), "a key starting with an exact-only name is kept");
	t.notOk(isListedQueryKey("idtokenhinted"), "a key starting with idtokenhint is kept");
	t.end();
});

test("parseHttpUrl returns an http or https url, and undefined for anything else", t => {
	t.strictEqual(parseHttpUrl("not a url", undefined), undefined, "text that is not a url");
	t.strictEqual(parseHttpUrl("ftp://h.test/", undefined), undefined, "a scheme other than http and https");
	t.strictEqual(parseHttpUrl("https://h.test/x", undefined)?.href, "https://h.test/x", "an https url");
	t.end();
});

test("redactedWholeUrl redacts userinfo of either half, and leaves a url holding no credential alone", t => {
	t.strictEqual(redactedWholeUrl("https://user@h.test/x"), "https://REDACTED@h.test/x", "a username alone");
	t.strictEqual(redactedWholeUrl("https://:pw@h.test/x"), "https://REDACTED@h.test/x", "a password alone");
	t.strictEqual(redactedWholeUrl("https://user:pw@h.test/x?q=1"), "https://REDACTED@h.test/x?q=1", "both halves, the password dropped whole");
	t.strictEqual(redactedWholeUrl("https://h.test/x?token=a"), "https://h.test/x?token=REDACTED", "a listed key, with no userinfo invented");
	t.strictEqual(redactedWholeUrl("https://h.test/x?q=1"), undefined, "a url without a credential");
	t.strictEqual(redactedWholeUrl("not a url"), undefined, "text that is not a url");
	t.end();
});

test("redactedQuery reads each pair as a key and a value", t => {
	t.strictEqual(query("=//u:pw@h"), "=REDACTED", "a pair opening with = has an empty key, not the whole pair as its key");
	t.strictEqual(query("//u:pw+x@h.test/x=v"), "REDACTED=REDACTED", "userinfo in a key that a form-decoded + would cut short, found raw");
	t.strictEqual(query("//u:pw@h.test/x=REDACTED"), "REDACTED=REDACTED", "a key redacted beside a value that already reads REDACTED is a change");
	t.strictEqual(query("https:/u:pw@h.test=a%20b"), "REDACTED=REDACTED", "a url in the key, which the joined key and value no longer parses");
	t.strictEqual(query("q=1&n=a%20b"), undefined, "a query without a credential");
	t.end();
});

// The query of a url nested `levels` deep, its innermost query being `innermost`.
function nestedQuery(levels: number, innermost: string): string {
	let search = innermost;

	for (let level = 2; level <= levels; level++) {
		search = `n=${encodeURIComponent(`https://h.test/?${search}`)}`;
	}

	return search;
}

test("redactedQuery keeps a url-opening key or value eight levels deep, and redacts one in the ninth", t => {
	t.strictEqual(query(nestedQuery(8, "https://[=1")), undefined, "a key the runtime cannot parse, eighth level, is read as written");
	t.ok(query(nestedQuery(9, "https://[=1"))?.includes("REDACTED"), "past the nesting limit a url-opening key counts as holding a credential");
	t.strictEqual(query(nestedQuery(8, "v=https://[")), undefined, "a value the runtime cannot parse, eighth level, is read as written");
	t.ok(query(nestedQuery(9, "v=https://["))?.includes("REDACTED"), "past the nesting limit a url-opening value counts as holding a credential, parsed or not");
	t.end();
});

test("redactedQuery reads userinfo a key opens, within its pair and across later pairs, as a parser does", t => {
	t.strictEqual(query("\\\\u:p=w@h.test&m=1"), "REDACTED=REDACTED&m=1", "userinfo a backslash opens, across the =");
	t.strictEqual(query("\\\\u:p&\\\\v&w@h.test&m=1"), "REDACTED=REDACTED&REDACTED=REDACTED&REDACTED=REDACTED&m=1", "a key opening userinfo inside a run joins it");
	t.strictEqual(query("\\\\u:p&\\\\v=x@a/b&w@h.test"), "REDACTED=REDACTED&REDACTED=REDACTED&w%40h.test=", "the value that closes a run ends it at its last @");
	t.strictEqual(query("\\\\u&\\\\v=a/b&w@h.test"), undefined, "a delimiter before any @ closes the run, and the run it closes holds no pair");
	t.strictEqual(query("x@y\\\\u=1"), undefined, "an @ before the key opens userinfo is no part of it");
	t.strictEqual(query("//u:p=ss//x@h.test"), "REDACTED=REDACTED", "a key opening userinfo, in a pair holding userinfo past the value's first /");
	t.strictEqual(query(`//u:p=a/%${"25".repeat(10)}40`), "REDACTED=REDACTED", "a key opening userinfo beside a value encoded past the reading limit, which may hide the @");
	t.end();
});

test("redactedQuery redacts a url in a value whose userinfo only the runtime's parser finds", t => {
	t.strictEqual(query("next=https:/u:pw@h.test"), "next=REDACTED", "one slash after a special scheme still opens userinfo");
	t.end();
});

// The parses `redactedQuery` makes of a query holding `levels` urls, each nested as the key of the
// one before.
function parsesOfNestedKeys(levels: number): number {
	const RealUrl = URL;
	let parses = 0;
	const CountingUrl = class extends URL {
		constructor(...args: ConstructorParameters<typeof URL>) {
			parses++;
			super(...args);
		}
	};
	let nested = "https://h.test/?x=1";

	for (let level = 1; level < levels; level++) {
		nested = `https://h.test/?${nested}`;
	}

	withGlobals({ URL: CountingUrl }, () => {
		redactedQuery(new RealUrl(`https://h.test/?${nested}`));
	});

	return parses;
}

test("redactedQuery re-reads no part of a chain of nested url keys, so its parses grow linearly with the depth", t => {
	const shallow = parsesOfNestedKeys(4);
	const deep = parsesOfNestedKeys(8);

	t.ok(shallow > 0, "the chain is parsed");
	t.ok(deep <= 3 * shallow, `eight levels cost at most three times four levels, where re-reading each part would cost about sixteen times: ${shallow} against ${deep}`);
	t.end();
});
