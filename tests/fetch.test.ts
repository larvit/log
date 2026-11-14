import { isCredentialHeaderName } from "../credentials/header-names.js";
import { buildUrlFull } from "../credentials/span-values.js";
import { formatTraceparent, generateSpanId, generateTraceId, Log, parseTraceparent, type TimerHandle } from "../index.js";
import { STATUS_CODE_ERROR, STATUS_CODE_UNSET } from "../otlp/payloads.js";
import { capturedHeaders, fetchFailure, type FetchTrace, requestAttributes, responseAttributes, spanStatusCode } from "../tracing/fetch.js";
import { openSpan } from "../tracing/spans.js";
import test from "./tap.js";
import { callHeader, capture, clientSpan, exportedRecords, exportedSpans, response, stubFetch, waitFor } from "./test-doubles.js";

test("log.fetch traces a successful call and drops the query by default", async t => {
	const { calls } = stubFetch();
	const log = new Log({ context: { "service.name": "svc", tenant: "acme" }, otlpHttpBaseURI: "http://127.0.0.1:4318", stderr: () => {} });

	const res = await log.fetch("https://api.test:8443/users?token=secret&q=hi", { method: "POST" });

	await log.end();

	t.strictEqual(res.status, 200, "the underlying response is returned");

	// The outgoing request continues this log's trace under a fresh child span.
	const sent = parseTraceparent(callHeader(calls.find(call => call.path === "/users")!, "traceparent") ?? "");

	t.strictEqual(sent?.traceId, log.span.traceId, "outgoing request continues this log's trace");
	t.notStrictEqual(sent?.spanId, log.span.spanId, "a fresh child span id is propagated, not the calling span's");

	const span = clientSpan(calls);
	const attr = (key: string) => span.attributes.find((attribute: any) => attribute.key === key)?.value.stringValue;

	t.strictEqual(span.kind, 3, "client span kind");
	t.strictEqual(span.name, "POST api.test:8443", "low-cardinality name (method + host)");
	t.strictEqual(span.parentSpanId, log.span.spanId, "span nests under the calling log span");
	t.strictEqual(span.spanId, sent?.spanId, "the propagated span id is the exported span");
	t.strictEqual(attr("http.request.method"), "POST", "method attribute");
	t.strictEqual(attr("url.full"), "https://api.test:8443/users", "url.full drops query and userinfo");
	t.strictEqual(attr("url.scheme"), "https", "scheme attribute");
	t.strictEqual(attr("server.address"), "api.test", "server.address attribute");
	t.strictEqual(attr("server.port"), "8443", "server.port attribute");
	t.strictEqual(attr("tenant"), "acme", "the log's context rides on the span");
	t.strictEqual(attr("http.response.status_code"), "200", "status_code attribute");
	t.end();
});

test("log.fetch sends a Request passed as init with its own method, body, signal and headers", async t => {
	const sent: Request[] = [];

	// What the platform's fetch(url, init) builds from its two arguments, whichever shape init has.
	globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
		sent.push(new Request(input, init));

		return response();
	}) as unknown as typeof fetch;

	const controller = new AbortController();
	const log = new Log({ stderr: () => {} });
	const request = new Request("https://api.test/x", { body: "payload", headers: { "x-keep": "kept" }, method: "POST", signal: controller.signal });

	await log.fetch("https://api.test/x", request);
	controller.abort();

	t.strictEqual(sent.length, 1, "one request is sent");
	t.strictEqual(sent[0].method, "POST", "the Request's method is kept");
	t.strictEqual(await sent[0].text(), "payload", "the Request's body is kept");
	t.strictEqual(sent[0].signal.aborted, true, "the Request's signal is kept");
	t.strictEqual(sent[0].headers.get("x-keep"), "kept", "the Request's headers are kept");
	t.strictEqual(sent[0].headers.get("traceparent")?.split("-")[1], log.span.traceId, "the request continues the log's trace");
	await log.end();
	t.end();
});

for (const key of [...["GoogleAccessId", "X-Amz-Credential", "X-Amz-Security-Token", "X-Amz-Signature", "X-Goog-Credential"], ...["access_token", "API_KEY", "apikey", "key", "Token", "access-token", "AccessToken", "api-key", "auth_token", "client_secret", "id_token", "password", "refresh_token", "Secret", "Subscription-Key", "authToken", "client-secret", "X_Amz_Signature", "apiKey", "x-api-key", "code", "id_token_hint", "auth", "old_password", "Passphrase", "consumer_id", "PrivateKeyId", "pwd", "X-Custom-Signed", "urn%3Asecret", "pword", "new_password2", "_code"]]) {
	test(`buildUrlFull with captureQuery records the value of a ${key} query key as REDACTED`, t => {
		t.strictEqual(buildUrlFull(new URL(`https://api.test/x?q=kept&${key}=v4lue`), true), `https://api.test/x?q=kept&${key}=REDACTED`, "the key is kept, its value redacted");
		t.end();
	});
}

test("log.fetch captureQuery keeps the query but redacts known-sensitive keys and url credentials", async t => {
	const { calls } = stubFetch();
	const log = new Log({ captureQuery: true, otlpHttpBaseURI: "http://127.0.0.1:4318", stderr: () => {} });

	await log.fetch("https://api.test/fetch/https://myuser:pwpath@cb.test/x?q=hi&Signature=abc&Signature=def&next=https%3A%2F%2Fmyuser%3Ahunter2%40cb.test%2Fx&deep=https%253A%252F%252Fmyuser%253Apwdeep%2540cb.test%252Fx&X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAEXAMPLE%2F20260923%2Feu-north-1%2Fs3%2Faws4_request&X-Amz-Security-Token=FwoGZXIvYXdz&X-Amz-Signature=8b1c9f&X-Goog-Credential=svc%40proj.iam.gserviceaccount.com%2F20260923%2Fauto%2Fstorage%2Fgoog4_request&GoogleAccessId=svc%40proj.iam.gserviceaccount.com&access_token=ya29tok&API_KEY=k1api&apikey=k2api&key=k3api&Token=k4tok&access-token=v0cred&AccessToken=v1cred&api-key=v2cred&auth_token=v3cred&client_secret=v4cred&id_token=v5cred&password=v6cred&refresh_token=v7cred&Secret=v8cred&Subscription-Key=v9cred&authToken=w0cred&client-secret=w1cred&X_Amz_Signature=w2cred&apiKey=w3cred&x-api-key=u0cred&code=u1cred&id_token_hint=u2cred&auth=u3cred&old_password=u4cred&Passphrase=u5cred&consumer_id=u6cred&PrivateKeyId=u7cred&pwd=u8cred&X-Custom-Signed=u9cred&urn:secret=u10cred&pword=u11cred&new_password2=u14cred&_code=u12cred&https://u:pw47@h.test/x/token=u13cred&zipcode=kept2&X-Amz-SignedHeaders=host&keyword=kept&?kept=1&https://a@b=pw20@evil.test&https://dXNlcg==:pw21@evil.test&https://t.test/x?token=k5tok&then=https://t.test/y?sig=k6sig&n2=https://my+user:pw9@cb.test/x&n6=https%3A%2F%2Ft.test%2Fx%3Fnext2%3Dhttps%253A%252F%252Fu.test%252F%253Ftoken%253Dk10tok&https://t.test/x?next=https%3A%2F%2Fuser%3Ap%2523w40%40h.test%2F&https://t.test/y?next=https%3A%2F%2Fuser%3Ap%252Fw41%40h.test%2F&https%3A%2F%2Ft.test%2Fx%3Fnext%3Dhttps%253A%252F%252Fuser%253Apw42%2540h.test=%3C&https://user:pa=ss43@host&%20https://user:pa=ss44@host&h%09ttps://user:pa=ss45@host&%01https://user:pa=ss46@host&flow=1&redirect_uri=https%3A%2F%2Flocalhost%3A3000&scope=openid&login_hint=bob%40x.test&next2=myapp:///cb%3Faccess_token%3Dk20tok&q2=a:b&//u:pw50@h.test=v&//u:p=w51@h.test&//u:p=w52@h.test/x?n=//x:y@z&d10=db%20postgres://u:pw53%5Cw@h&d9=%25252525252525252525252541&https%3A%2F%2Fmyuser%3Ahunter2%40cb.test%2Fz");
	await log.end();

	const urlFull = clientSpan(calls).attributes.find((attribute: any) => attribute.key === "url.full").value.stringValue;

	t.ok(urlFull.startsWith("https://api.test/fetch/REDACTED?q=hi&"), "a url nested in the request path records REDACTED, and a non-sensitive query param is kept");
	t.ok(urlFull.includes("Signature=REDACTED&Signature=REDACTED"), "a repeated sensitive key keeps one redaction per occurrence");
	t.ok(!urlFull.includes("abc") && !urlFull.includes("def"), "neither sensitive value is leaked");
	t.ok(urlFull.includes("&next=REDACTED&"), "a query value parsing as a url with userinfo once decoded records REDACTED");
	t.ok(urlFull.includes("&deep=REDACTED&"), "a url percent-encoded twice records REDACTED");
	t.ok(urlFull.endsWith("&REDACTED=REDACTED"), "a credentialed url written as a bare query key is redacted, its value with it");
	t.ok(!urlFull.includes("hunter2"), "the nested password is not leaked");
	t.ok(urlFull.includes("X-Amz-Algorithm=AWS4-HMAC-SHA256"), "a presigned url's non-credential params are kept");
	t.ok(!/AKIAEXAMPLE|FwoGZXIvYXdz|8b1c9f|gserviceaccount/.test(urlFull), "no presigned credential value is leaked");
	t.ok(!/ya29tok|k1api|k2api|k3api|k4tok|[uvw]\d+cred|pw47/.test(urlFull), "no token value is leaked, nor the userinfo of a url key ending in a term, a spelling with `-` or `_` dropped or added included");
	t.ok(urlFull.includes("keyword=kept&%3Fkept=1&"), "a key merely starting with a listed name is kept, and a key's leading ? with it");
	t.ok(urlFull.includes("&zipcode=kept2&X-Amz-SignedHeaders=host&"), "a key ending in an exact-only name, or holding a term short of its end, is kept");
	t.ok(urlFull.includes("&REDACTED=REDACTED&REDACTED=REDACTED&REDACTED=REDACTED&then=") && !/pw2[01]|k5tok/.test(urlFull), "a url in a query key is read with its value: userinfo running across `=` or a listed key in it redacts both");
	t.ok(urlFull.includes("&then=https%3A%2F%2Ft.test%2Fy%3Fsig%3DREDACTED&"), "a url nested in a query value has its listed key redacted");
	t.ok(urlFull.includes("&n2=REDACTED&"), "userinfo holding a space is redacted");
	t.ok(urlFull.includes("&n6=https%3A%2F%2Ft.test%2Fx%3Fnext2%3Dhttps%253A%252F%252Fu.test%252F%253Ftoken%253DREDACTED&"), "a url nested two deep has its listed key redacted");
	t.ok(urlFull.includes("&n6=https%3A%2F%2Ft.test%2Fx%3Fnext2%3Dhttps%253A%252F%252Fu.test%252F%253Ftoken%253DREDACTED&REDACTED=REDACTED&REDACTED=REDACTED&REDACTED=REDACTED&REDACTED=REDACTED&REDACTED=REDACTED&REDACTED=REDACTED&REDACTED=REDACTED&flow=1&") && !/w4[01]|pw42|ss4[3-6]/.test(urlFull), "a url in a query key is read alone too, where its value breaks the joined reading, and a key cut short by an = in its password is read with its value, whitespace or a control character the parser drops included");
	t.ok(urlFull.includes("&next2=myapp%3A%2F%2F%2Fcb%3Faccess_token%3DREDACTED&q2=a%3Ab&"), "a url without a host has its listed key redacted, and a scheme alone leaves a value be");
	t.ok(urlFull.includes("&q2=a%3Ab&REDACTED=REDACTED&REDACTED=REDACTED&REDACTED=REDACTED&d10=REDACTED&d9=REDACTED&") && !/pw5[0-3]/.test(urlFull), "userinfo in a key, or across its =, redacts both, and a value past eight encodings records REDACTED");
	t.ok(urlFull.includes("&flow=1&redirect_uri=https%3A%2F%2Flocalhost%3A3000&scope=openid&login_hint=bob%40x.test&"), "an encoded url in a value leaves the pairs after it alone");
	t.end();
});

test("log.fetch captureQuery reads a value up to eight encodings and eight nested urls deep", async t => {
	const { calls } = stubFetch();
	const log = new Log({ captureQuery: true, otlpHttpBaseURI: "http://127.0.0.1:4318", stderr: () => {} });
	let encoded = "a/b";

	for (let i = 0; i < 8; i++) encoded = encodeURIComponent(encoded);

	const chain = (depth: number) => `${"https://h.test/?n=".repeat(depth - 1)}https://h.test/?q=1`;

	await log.fetch(`https://api.test/x?v8=${encoded}&v9=${encodeURIComponent(encoded)}`);
	await log.fetch(`https://api.test/x?n=${chain(8)}`);
	await log.fetch(`https://api.test/x?n=${chain(9)}`);
	await log.end();

	const urlFulls = exportedSpans(calls).filter(span => span.kind === 3).map(span => span.attributes.find((attribute: any) => attribute.key === "url.full").value.stringValue);

	t.strictEqual(urlFulls[0], `https://api.test/x?v8=${encoded}&v9=REDACTED`, "a value percent-encoded eight times is kept, and nine times records REDACTED");
	t.strictEqual(urlFulls[1], `https://api.test/x?n=${encodeURIComponent(chain(8))}`, "a url nested eight deep is kept, percent-encoded as a query value");
	t.ok(/%(?:25)*3DREDACTED$/.test(urlFulls[2]) && !urlFulls[2].includes("q%"), "the url nested ninth records REDACTED whole");
	t.end();
});

// Where a key opens userinfo, every pair from that key up to the last @ before a delimiter records
// REDACTED. Where a value opens a url, or a delimiter comes before the @, the pairs stay as written.
const redactedPairs = (count: number) => Array.from({ length: count }, () => "REDACTED=REDACTED").join("&");
const SPLIT_USERINFO_QUERIES: [string, string][] = [
	["a=1&//u:pw60&w@h.test&b=2", `a=1&${redactedPairs(2)}&b=2`],
	["//u:pw61&w@h.test/x&k=1", `${redactedPairs(2)}&k=1`],
	["//u:pw62@x&w@h.test&m=1", `${redactedPairs(2)}&m=1`],
	["//u:pw63&k=v&w%40h.test&m=1", `${redactedPairs(3)}&m=1`],
	["//u:pw64&w%2540h.test&m=1", `${redactedPairs(2)}&m=1`],
	["\\\\u:pw65&w@h.test&m=1", `${redactedPairs(2)}&m=1`],
	["x=1&//u:pw66@x&k=v&w@h.test", `x=1&${redactedPairs(3)}`],
	["//u:pw67&a/b&w@h.test", "%2F%2Fu%3Apw67=&a%2Fb=&w%40h.test="],
	["//u:pw68=/x&w@h.test", "%2F%2Fu%3Apw68=%2Fx&w%40h.test="],
	["//u:pw69&a/b//v:pw70&w@h.test&m=1", `%2F%2Fu%3Apw69=&${redactedPairs(2)}&m=1`],
	["//user:pw71=ss%2F%2Fx@h.test&m=1", `${redactedPairs(1)}&m=1`],
	["//u:pw72=a/b@c", "%2F%2Fu%3Apw72=a%2Fb%40c"],
	["//u:pw73&a?b&w@h.test", "%2F%2Fu%3Apw73=&a%3Fb=&w%40h.test="],
	["%252F%252Fu%253Apw74&w@h.test&m=1", `${redactedPairs(2)}&m=1`],
	["//u:pw75&q//v:pw76&w@h.test", `%2F%2Fu%3Apw75=&${redactedPairs(2)}`],
	[`//u:pw77&%${"25".repeat(10)}40&m=1`, `${redactedPairs(2)}&m=1`],
	[`%${"25".repeat(10)}41&w@h.test&m=1`, `${redactedPairs(2)}&m=1`],
	["//u:pw78@h.test/x=1&m=1", `${redactedPairs(1)}&m=1`],
	["//u:pw79&k=w@&m=1", `${redactedPairs(2)}&m=1`],
	["//u:pw80&/x@y&m=1", "%2F%2Fu%3Apw80=&%2Fx%40y=&m=1"],
	["e=//host&mail=a@b.test&%2F%2Fx/y&z=4", "e=%2F%2Fhost&mail=a%40b.test&%2F%2Fx%2Fy=&z=4"],
	// Raw, `+`, `%2F`, `%3F` and `%23` stay inside userinfo, which the form-decoded reading would end.
	["//u:pw81+x@h.test&m=1", `${redactedPairs(1)}&m=1`],
	["next=//my+user:pw82@cb.test/x&m=1", "next=REDACTED&m=1"],
	["//u:pw83&a%2Fb&w@h.test&m=1", `${redactedPairs(3)}&m=1`],
	["//u:pw84&a%3Fb&w@h.test&m=1", `${redactedPairs(3)}&m=1`],
	["//u:pw85&a%23b&w@h.test&m=1", `${redactedPairs(3)}&m=1`],
	// A consumer that decodes `%09`, `%0A` or `%0D` gets a tab, newline or carriage return, which a url parser drops.
	["//us%09er:pw86&w%40h.test&m=1", `${redactedPairs(2)}&m=1`],
	["//u:pw87&w%09x%40h.test&m=1", `${redactedPairs(2)}&m=1`],
	["//u:pw88&w%0Ax%40h.test&m=1", `${redactedPairs(2)}&m=1`],
	["\\\\us%0Der:pw89&w%40h.test&m=1", `${redactedPairs(2)}&m=1`],
	// A no-break space, or other whitespace a url parser keeps, doesn't end the userinfo. A plain space does.
	["//&u:p@host", redactedPairs(2)],
	["%5C%5C&u:p@host", redactedPairs(2)],
	["%2F%2Fu:p%C2%A0x&w@host", redactedPairs(2)],
	["%5C%5Cu:p%C2%A0x&w@host", redactedPairs(2)],
	["//u:p&x%C2%A0y%40h", redactedPairs(2)],
	["%2F%2Fhost&and%20mail%20a%40b", "%2F%2Fhost=&and+mail+a%40b="],
	["%2F%2Fh&a%23b%40c", "%2F%2Fh=&a%23b%40c="],
	["//b/c&x@y", "%2F%2Fb%2Fc=&x%40y="],
	["%5C%5Cb/c&x@y", "%5C%5Cb%2Fc=&x%40y="],
	["%5C%5Ca%5Cb&x@y", "%5C%5Ca%5Cb=&x%40y="],
	["a+b=c+d&q=1+2", "a+b=c+d&q=1+2"],
	// `%2540` is an `@` encoded twice, and `%C2%25A0` a no-break space with its second byte encoded twice.
	["next=//user:pw86%C2%25A0ss%2540host/x&m=1", "next=REDACTED&m=1"],
	["//u:p87+q&w%40h.test&m=1", `${redactedPairs(2)}&m=1`],
	["//u:pw88+x&w%2540h.test&m=1", `${redactedPairs(2)}&m=1`],
	["//my+user:pw89&x%40cb.test/x", redactedPairs(2)],
	["&//u:pw90+x@h.test&m=1", `${redactedPairs(1)}&m=1`],
	["a=1&&next=//my+user:pw91@cb.test/x&m=1", "a=1&next=REDACTED&m=1"],
	["//u:pw92+x=y&z@h.test&m=1", `${redactedPairs(2)}&m=1`],
	["//u:pw93=a%2Fb&w@h.test&m=1", `${redactedPairs(2)}&m=1`],
	["%252F%252Fuser%C2%25A0x:pw94&w%252540h.test&m=1", `${redactedPairs(2)}&m=1`],
];

for (const [query, expected] of SPLIT_USERINFO_QUERIES) {
	test(`buildUrlFull with captureQuery records ?${query} as ?${expected}`, t => {
		t.strictEqual(buildUrlFull(new URL(`https://api.test/x?${query}`), true), `https://api.test/x?${expected}`, "records the expected url");
		t.end();
	});
}

test("log.fetch captureQuery redacts a url key whose scheme holds a tab the parser drops", async t => {
	const { calls } = stubFetch();
	const log = new Log({ captureQuery: true, otlpHttpBaseURI: "http://127.0.0.1:4318", stderr: () => {} });

	await log.fetch("https://api.test/x?a=1&ht%09tps://h.test/p?code=pw90&b=2");
	await log.end();

	const urlFull = clientSpan(calls).attributes.find((attribute: any) => attribute.key === "url.full").value.stringValue;

	t.strictEqual(urlFull, "https://api.test/x?a=1&REDACTED=REDACTED&b=2", "a key opening a url once its tab is dropped is redacted with its value");
	t.end();
});

test("log.fetch captureQuery redacts a listed key after a ? in a kept value's fragment", async t => {
	const { calls } = stubFetch();
	const log = new Log({ captureQuery: true, otlpHttpBaseURI: "http://127.0.0.1:4318", stderr: () => {} });

	await log.fetch("https://api.test/x?a=1&back=https%3A%2F%2Fh.test%2Fx%23a%3Ftoken%3Dpwfrag&b=2");
	await log.end();

	const urlFull = clientSpan(calls).attributes.find((attribute: any) => attribute.key === "url.full").value.stringValue;

	t.strictEqual(urlFull, "https://api.test/x?a=1&back=REDACTED&b=2", "a url parsing whole with the key in its fragment records REDACTED");
	t.end();
});

test("log.fetch captureQuery redacts a listed key opening a kept value's fragment", async t => {
	const { calls } = stubFetch();
	const log = new Log({ captureQuery: true, otlpHttpBaseURI: "http://127.0.0.1:4318", stderr: () => {} });

	await log.fetch("https://api.test/x?a=1&back=https%3A%2F%2Fh.test%2Fcb%23access_token%3Dpwfrag2%26token_type%3Dbearer&b=2");
	await log.end();

	const urlFull = clientSpan(calls).attributes.find((attribute: any) => attribute.key === "url.full").value.stringValue;

	t.strictEqual(urlFull, "https://api.test/x?a=1&back=REDACTED&b=2", "a url parsing whole with the key opening its fragment records REDACTED");
	t.end();
});

const NESTED_URL_PATHS: Record<string, string> = {
	"/a/https://u:pw1@cb.test/x": "/a/REDACTED",
	"/b/c/https%3A%2F%2Fu%3Apw2%40cb.test%2Fx": "/b/c/REDACTED",
	"/d/https%253A%252F%252Fu%253Apw3%2540cb.test": "/d/REDACTED",
	"/e/https:%5C%5Cu:pw4@cb.test": "/e/REDACTED",
	"/f/https%3A%2F%2Fs3.test%2Fk%3FX-Amz-Signature%3Dpw5%26X-Amz-Date%3D1": "/f/REDACTED",
	"/g/x:y/https://u:pw6@cb.test": "/g/REDACTED",
	"/h//u:pw7@cb.test/x": "/REDACTED",
	"/h2/%2F%2Fu:pw8@a.test/https:%2F%2Fv:pw9@cb.test": "/REDACTED",
	"/h3//tok_en:pw10@a.test/https:%2F%2Fv:pw11@cb.test": "/REDACTED",
	"/i/a:/a:/a:/a:/a:/a:/a:/a:/a:/x": "/i/a:/a:/a:/a:/a:/a:/a:/a:/REDACTED",
	"/j/%25252525252525252525252541": "/REDACTED",
	"/k/s3.test/k%3Fsig%3Dpw12": "/k/s3.test/REDACTED",
	"/l/s3.test/k%3FX-Amz-Date%3D1%26X-Amz-Signature%3Dpw13": "/l/s3.test/REDACTED",
	"/m/x=https:%2F%2Fcb.test%2Fx%3Fpassword%3Dpw14": "/m/REDACTED",
	"/n/x;https:%2F%2Fcb.test%2Fx%3Ftoken%3Dpw15": "/n/REDACTED",
	"/o/s3.test/k%253Fsig%253Dpw16": "/o/s3.test/REDACTED",
	"/p/k%3Fsig%3Dpw17/x%3Ftoken%3Dpw18": "/p/REDACTED",
	"/p2/a;token=pw62/https://u:pw63@cb.test/x": "/p2/REDACTED",
	"/p3/x%3Ftoken=pw64/https:%2F%2Fu:pw65@cb.test": "/p3/REDACTED",
	"/q/p%3F%20token%3Dpw60/x": "/q/REDACTED",
	"/q/p%3Fa%23token%3Dpw61/x": "/q/REDACTED",
	"/q/s3.test/k%3Fpage%3D2/token": "/q/s3.test/k%3Fpage%3D2/token",
	"/r/s3.test/k%3Fsi%09g%3Dpw19": "/r/s3.test/REDACTED",
	"/r2/https://s3.test/k%3Fsig%3Dpw20": "/r2/REDACTED",
	"/r3/https%3A%2F%2Fcb.test%2Fx%23access_token%3Dpw21": "/r3/REDACTED",
	"/registry/@larvit/log/users/bob@x.test/https://cb.test/x?q=1": "/registry/@larvit/log/users/bob@x.test/https://cb.test/x",
};

for (const [path, expected] of Object.entries(NESTED_URL_PATHS)) {
	test(`buildUrlFull records the path ${path} as ${expected}`, t => {
		t.strictEqual(buildUrlFull(new URL(`https://proxy.test${path}`), false), `https://proxy.test${expected}`, "records the expected path");
		t.end();
	});
}

test("log.fetch exports a url nested base64-encoded in the request path as written", async t => {
	const { calls } = stubFetch();
	const log = new Log({ otlpHttpBaseURI: "http://127.0.0.1:4318", stderr: () => {} });
	// base64url of https://s3.test/photo.jpg?sig=SECRET, as an image proxy takes it.
	const path = "/insecure/rs:fit:300/aHR0cHM6Ly9zMy50ZXN0L3Bob3RvLmpwZz9zaWc9U0VDUkVU";

	await log.fetch(`https://proxy.test${path}`);
	await log.end();

	const [span] = exportedSpans(calls).filter(exported => exported.kind === 3);

	t.strictEqual(span.attributes.find((attribute: any) => attribute.key === "url.full").value.stringValue, `https://proxy.test${path}`, "the path records as written");
	t.end();
});

// Each url below is long, deeply encoded or deeply nested. A redaction that rescans its input takes
// quadratic time on it, and tap's per-test timeout fails that test.
const deepPercent = `%${"25".repeat(16384)}41`;
const nestedSevenDeep = Array.from({ length: 7 }).reduce<string>(nested => `https://a/?${encodeURIComponent(nested)}=b`, `https://t/?x=${"a".repeat(40000)}`);

for (const query of ["?u=https://a/?".repeat(16384), "?https://a/?".repeat(16384), `?${nestedSevenDeep}`, `${"/a:".repeat(16384)}%3F`, `${deepPercent}/https:/${deepPercent}?q=${deepPercent}`, `?q=${"\\".repeat(32768)} x`, `?q=//${"\\".repeat(32768)} x`, `${"%5C".repeat(32768)}%20x`, `?//u:p${"&a@".repeat(16384)}`, `?//u:p=/${"&a@".repeat(16384)}`, `?${"//u:p&a@&".repeat(8192)}`]) {
	test(`log.fetch redacts and exports the long url https://proxy.test/${query.slice(0, 13)}…`, async t => {
		const { calls } = stubFetch();
		const log = new Log({ captureQuery: true, captureRequestHeaders: ["x-deep"], otlpHttpBaseURI: "http://127.0.0.1:4318", stderr: () => {} });

		await log.fetch(`https://proxy.test/${query}`, { headers: { "x-deep": deepPercent } });
		await log.end();
		t.strictEqual(exportedSpans(calls).filter(span => span.kind === 3).length, 1, "its span is exported");
		t.end();
	});
}

test("log.fetch leaves a non-http(s) URL untraced", async t => {
	const { calls } = stubFetch();
	const log = new Log({ captureQuery: true, otlpHttpBaseURI: "http://127.0.0.1:4318", stderr: () => {} });

	await log.fetch("myapp:user:hunter2@api.test/x");
	await log.fetch("data:text/plain,secret-payload");
	await log.end();

	const exported = JSON.stringify(calls.filter(call => call.path.startsWith("/v1/")));

	t.strictEqual(exportedSpans(calls).length, 1, "only the root span is exported, no client span");
	t.ok(!exported.includes("hunter2"), "userinfo never reaches the collector");
	t.ok(!exported.includes("secret-payload"), "a data: payload never reaches the collector");

	const passed = calls.find(call => call.url.startsWith("myapp:"));

	t.strictEqual(passed?.url, "myapp:user:hunter2@api.test/x", "the input reaches fetch unchanged");
	t.strictEqual(callHeader(passed!, "traceparent"), null, "no trace context is propagated");
	t.end();
});

test("log.fetch keeps a url's credentials off the exported span", async t => {
	const runtimeFetch = globalThis.fetch.bind(globalThis);
	const { calls } = stubFetch();
	const exportFetch = globalThis.fetch;

	// Only the export is stubbed: the traced call reaches the runtime's own fetch, which refuses a
	// url carrying credentials while building the Request, so nothing leaves the machine.
	globalThis.fetch = ((input: string | URL, init?: RequestInit) => new URL(String(input)).port === "4318" ? exportFetch(input, init) : runtimeFetch(input, init)) as typeof fetch;

	const log = new Log({ otlpHttpBaseURI: "http://127.0.0.1:4318", stderr: () => {} });
	let rejection = "";

	await log.fetch("http://myuser:hunter2@127.0.0.1:45231/x?access_token=s3cr3t").catch((err: Error) => { rejection = err.message; });
	await log.end();

	const span = clientSpan(calls);
	const urlFull = span.attributes.find((attribute: any) => attribute.key === "url.full").value.stringValue;

	// Red here means the runtime stopped quoting the credential: drop this line, keep the rest.
	t.ok(rejection.includes("hunter2"), "the runtime's own rejection, credentials and all, reaches the caller");
	t.ok(!JSON.stringify(calls).includes("hunter2"), "the password reaches nothing the collector is sent");
	t.ok(!JSON.stringify(calls).includes("myuser"), "the username reaches nothing the collector is sent");
	t.ok(!JSON.stringify(calls).includes("s3cr3t"), "the access_token reaches nothing the collector is sent");
	t.strictEqual(urlFull, "http://127.0.0.1:45231/x", "url.full keeps the url without the userinfo");
	t.strictEqual(span.status.code, 2, "the span is ERROR");
	// The wording around it differs between Node and the browser; the redaction does not.
	t.ok(span.status.message.includes("http://REDACTED@127.0.0.1:45231/x?access_token=REDACTED"), "the runtime's own message survives with the userinfo redacted");
	t.end();
});

test("log.fetch redacts its url in a runtime's rejection that parses as a url whole", async t => {
	const href = "https://myuser:hunter2@api.test/fetch/https:%2F%2Fcb.test%2Fy%3Ftoken%3Dnested1?token=s3cr3t";
	const { calls } = stubFetch(path => {
		if (path.startsWith("/fetch/")) {
			// Firefox's wording, whose `Window.fetch:` prefix is a scheme.
			throw new TypeError(`Window.fetch: ${href} is an url with embedded credentials.`);
		}
	});
	const log = new Log({ otlpHttpBaseURI: "http://127.0.0.1:4318", stderr: () => {} });

	await log.fetch(href).catch(() => {});
	await log.end();

	const exported = JSON.stringify(calls.filter(call => call.path.startsWith("/v1/")));

	t.ok(!exported.includes("hunter2") && !exported.includes("s3cr3t") && !exported.includes("nested1"), "neither the password nor a token, in the query or in a url nested in the path, reaches the collector");
	t.end();
});

test("log.fetch redacts a listed query key in a header value or kept query value that no url parser reads whole", async t => {
	const { calls } = stubFetch(path => path === "/h" ? response({ headers: new Headers({ link: "</next?page=2&access_token=hunter2>; rel=next", location: "/cb?token=hunter2", "x-cursor": "page=2&sig=hunter2", "x-enc": "cb%3Ftoken%3Dhunter2", "x-keyword": "/search?keyword=kept&q=a", "x-matrix": "/cdn/img;sig=hunter2", "x-nested": "/login?next=/cb?token=hunter2", "x-plain": "text/html; q=0.9", "x-semi": "/cdn/img;v;code=hunter2", "x-tab": "/cb?to\tken=hunter2" }) }) : undefined);
	const log = new Log({
		captureQuery: true,
		captureResponseHeaders: ["link", "location", "x-cursor", "x-enc", "x-keyword", "x-matrix", "x-nested", "x-plain", "x-semi", "x-tab"],
		otlpHttpBaseURI: "http://127.0.0.1:4318",
		stderr: () => {},
	});

	await log.fetch("https://api.test/h?src=%2F%2Fcdn.test%2Fk%3Fsig%3Dhunter2&via=cdn.test%2Fk%3Fx-amz-signature%3Dhunter2%26a%3Db&%2F%2Fcdn.test%2Fk%3Fsig%3Dhunter2&plain=cdn.test%2Fk%3Fpage%3D2&n=%2F%2Fcdn.test%2Fk%3Ftoken%3DREDACTED&v=%2Flogin%3Fnext%3D%2Fcb%3Ftoken%3Dhunter2&w=/cb?my%20token=hunter2");
	await log.end();

	const span = clientSpan(calls);
	const attr = (key: string) => span.attributes.find((attribute: any) => attribute.key === key)?.value.stringValue;

	t.strictEqual(attr("http.response.header.location"), "REDACTED", "a relative url holding a listed key records REDACTED");
	t.strictEqual(attr("http.response.header.link"), "REDACTED", "so does a link header holding one in angle brackets");
	t.strictEqual(attr("http.response.header.x-cursor"), "REDACTED", "so does text holding one with no url around it");
	t.strictEqual(attr("http.response.header.x-enc"), "REDACTED", "and one percent-encoded");
	t.strictEqual(attr("http.response.header.x-nested"), "REDACTED", "and one after a ? in another pair's value");
	t.strictEqual(attr("http.response.header.x-tab"), "REDACTED", "and one with a tab the parser drops from a key");
	t.strictEqual(attr("http.response.header.x-matrix"), "REDACTED", "and one after a ; as a matrix parameter");
	t.strictEqual(attr("http.response.header.x-semi"), "REDACTED", "also behind another ; key");
	t.strictEqual(attr("http.response.header.x-keyword"), "/search?keyword=kept&q=a", "a key that no listed name ends is kept");
	t.strictEqual(attr("http.response.header.x-plain"), "text/html; q=0.9", "a value with no query is kept");

	const urlFull = attr("url.full") as string;

	t.ok(urlFull.includes("?src=REDACTED&via=REDACTED&REDACTED=REDACTED&plain=cdn.test%2Fk%3Fpage%3D2&"), "a kept query value or key holding a protocol-relative or scheme-less url with a listed key records REDACTED");
	t.ok(urlFull.includes("&n=%2F%2Fcdn.test%2Fk%3Ftoken%3DREDACTED&"), "a value whose listed key is already redacted is kept");
	t.ok(urlFull.includes("&v=REDACTED&"), "a listed key after a ? in another pair's value records REDACTED");
	t.ok(urlFull.endsWith("&w=REDACTED"), "so does one whose key holds a space");
	t.ok(!urlFull.includes("hunter2"), "no credential is exported in url.full");
	t.notOk(JSON.stringify(calls.filter(call => call.path.startsWith("/v1/"))).includes("hunter2"), "no credential reaches the collector");
	t.end();
});

test("log.fetch redacts userinfo holding a tab the parser drops, in a captured header value and the request path", async t => {
	const { calls } = stubFetch(path => path === "/h" ? response({ headers: new Headers({ "x-tab": "retry https://admin:hun\tter2@db.test/x", "x-tab2": "db \\\\admin:hun\tter2@h" }) }) : undefined);
	const log = new Log({ captureResponseHeaders: ["x-tab", "x-tab2"], otlpHttpBaseURI: "http://127.0.0.1:4318", stderr: () => {} });

	await log.fetch("https://api.test/h");
	await log.fetch("https://api.test/p/%2F%2Fusr:pa%09ssw0rd@h.test/z");
	await log.end();

	const spans = exportedSpans(calls).filter(span => span.kind === 3);
	const attr = (span: any, key: string) => span.attributes.find((attribute: any) => attribute.key === key)?.value.stringValue;

	t.strictEqual(attr(spans[0], "http.response.header.x-tab"), "REDACTED", "a captured header value holding a tab in a password is redacted");
	t.strictEqual(attr(spans[0], "http.response.header.x-tab2"), "REDACTED", "and one opened by a backslash pair");
	t.strictEqual(attr(spans[1], "url.full"), "https://api.test/REDACTED", "a path segment opening userinfo that holds a decoded tab records REDACTED from it on");
	t.end();
});

// A url parser keeps these in userinfo, so a status message redacts it; only a plain space ends it in text.
for (const character of ["\v", "\f", "\u00a0", "\u1680", "\u2000", "\u200a", "\u2028", "\u2029", "\u202f", "\u205f", "\u3000", "\ufeff"]) {
	test(`userinfo holding U+${character.charCodeAt(0).toString(16).padStart(4, "0")} is redacted in a status message`, async t => {
		const { calls } = stubFetch();

		await new Log({ otlpHttpBaseURI: "http://127.0.0.1:4318", stderr: () => {} }).end({ error: new Error(`retry https://us${character}er:pw${character}hunter2@db.test/x and \\\\us${character}er:pw${character}hunter2@h and https:\\/pw${character}hunter2@h`) });

		t.deepEqual(exportedSpans(calls)[0].status, { code: 2, message: "retry https://REDACTED@db.test/x and \\\\REDACTED@h and https:\\/REDACTED@h" }, "after //, \\\\ and \\/");
		t.end();
	});
}

// A url parser keeps these in a query value.
for (const character of ["\v", "\f", "\u00a0", "\u1680", "\u2000", "\u200a", "\u2028", "\u2029", "\u202f", "\u205f", "\u3000", "\ufeff"]) {
	test(`a listed key's value holding U+${character.charCodeAt(0).toString(16).padStart(4, "0")} is redacted whole in a status message`, async t => {
		const { calls } = stubFetch();

		await new Log({ otlpHttpBaseURI: "http://127.0.0.1:4318", stderr: () => {} }).end({ error: new Error(`request to https://h.test/x?token=ab${character}cd&page=2 failed`) });

		t.deepEqual(exportedSpans(calls)[0].status, { code: 2, message: "request to https://h.test/x?token=REDACTED&page=2 failed" });
		t.end();
	});
}

test("a plain space still ends userinfo in a status message", async t => {
	const { calls } = stubFetch();

	await new Log({ otlpHttpBaseURI: "http://127.0.0.1:4318", stderr: () => {} }).end({ error: new Error("see //host and mail a@b, see \\\\host and mail a@b") });

	t.deepEqual(exportedSpans(calls)[0].status, { code: 2, message: "see //host and mail a@b, see \\\\host and mail a@b" });
	t.end();
});

test("log.fetch redacts userinfo holding a no-break space in a captured header value", async t => {
	const { calls } = stubFetch(path => path === "/h" ? response({ headers: new Headers({ "x-nbsp": "retry https://admin:hun\u00a0ter2@db.test/x", "x-nbsp2": "db \\\\admin:hun\u00a0ter2@h" }) }) : undefined);
	const log = new Log({ captureResponseHeaders: ["x-nbsp", "x-nbsp2"], otlpHttpBaseURI: "http://127.0.0.1:4318", stderr: () => {} });

	await log.fetch("https://api.test/h");
	await log.end();

	const span = exportedSpans(calls).find(exported => exported.kind === 3);
	const attr = (key: string) => span.attributes.find((attribute: any) => attribute.key === key)?.value.stringValue;

	t.strictEqual(attr("http.response.header.x-nbsp"), "REDACTED", "after //");
	t.strictEqual(attr("http.response.header.x-nbsp2"), "REDACTED", "and after a backslash pair");
	t.end();
});

test("log.fetch captures allow-listed request and response headers only, never a credential", async t => {
	const { calls } = stubFetch(path => path === "/h" ? response({ headers: new Headers({ link: "<https://user:pwlink@cdn.test>; rel=preconnect", location: "https://idp.test/authorize?redirect_uri=https%3A%2F%2Fmyuser%3Ahunter2%40cb.test%2Fx&state=a%b", "set-cookie": "sid=hunter2", "x-app": "myapp:///cb?access_token=hunter2", "x-callback": "https%3A%2F%2F%C5ke%3Apwenc%40cb.test%2Fx", "x-db": "db=postgres://u:pw\\db@h", "x-db2": "see <https:/\\u:pwmix1@h>; rel=x", "x-deep": "https%253A%252F%252Fu%253Apwdeep%2540h.test", "x-frag": "https://h.test/x#a?token=pwfrag", "x-frag2": "https://h.test/cb#access_token=pwfrag2&token_type=bearer", "x-next": "https://api.test/page?token=hunter2", "x-opaque": "http:u:pwopaque@h.test/x", "x-resp": "rv", "x-secret": "nope", "x-slash": "https:/u:pwslash@h.test/x" }) }) : undefined);
	const log = new Log({
		captureRequestHeaders: ["Authorization", "cookie", "referer", "x-amz-security-token", "X-Api-Key", "x-keyboard", "x-password", "x-req"],
		captureResponseHeaders: ["link", "location", "set-cookie", "x-app", "x-callback", "x-db", "x-db2", "x-deep", "x-frag", "x-frag2", "x-next", "x-opaque", "x-resp", "x-slash"],
		otlpHttpBaseURI: "http://127.0.0.1:4318",
		stderr: () => {},
	});

	await log.fetch("https://api.test/h", { headers: { authorization: "Bearer hunter2", cookie: "sid=hunter2", referer: "https://myuser:hunter2@cb.test/x", "x-amz-security-token": "hunter2", "x-api-key": "hunter2", "x-keyboard": "dvorak", "x-other": "ignored", "x-password": "kept", "x-req": "MyBot/1.0 (+https://mybot.test; ops@mybot.test)" } });
	await log.end();

	const span = clientSpan(calls);
	const attr = (key: string) => span.attributes.find((attribute: any) => attribute.key === key)?.value.stringValue;

	t.strictEqual(attr("http.request.header.x-req"), "MyBot/1.0 (+https://mybot.test; ops@mybot.test)", "allow-listed request header captured, a host then an address past a space included");
	t.strictEqual(attr("http.request.header.x-other"), undefined, "non-listed request header not captured");
	t.strictEqual(attr("http.request.header.authorization"), "REDACTED", "an allow-listed credential header records its presence, not its value");
	t.strictEqual(attr("http.request.header.x-api-key"), "REDACTED", "a header named by Elastic APM's sanitize_field_names records REDACTED, *key");
	t.strictEqual(attr("http.request.header.x-amz-security-token"), "REDACTED", "and *token*");
	t.strictEqual(attr("http.request.header.x-keyboard"), "dvorak", "a name holding key but not ending in it is exported as written");
	t.strictEqual(attr("http.request.header.x-password"), "kept", "and so is one holding password but not being it");
	t.strictEqual(attr("http.request.header.cookie"), "REDACTED", "cookie, the spec's optional addition, records REDACTED");
	t.strictEqual(attr("http.request.header.referer"), "REDACTED", "a captured header value holding url userinfo is redacted whole");
	t.strictEqual(attr("http.response.header.x-resp"), "rv", "allow-listed response header captured");
	t.strictEqual(attr("http.response.header.x-secret"), undefined, "non-listed response header not captured");
	t.strictEqual(attr("http.response.header.location"), "REDACTED", "a url in a header whose query value holds userinfo is redacted whole");
	t.strictEqual(attr("http.response.header.x-app"), "REDACTED", "so is one without a host holding a listed key");
	t.strictEqual(attr("http.response.header.x-next"), "REDACTED", "so is one with a listed query key");
	t.strictEqual(attr("http.response.header.link"), "REDACTED", "a url with userinfo among other text in a header is redacted whole");
	t.strictEqual(attr("http.response.header.x-callback"), "REDACTED", "so is a percent-encoded one");
	t.strictEqual(attr("http.response.header.x-deep"), "REDACTED", "and one percent-encoded twice");
	t.strictEqual(attr("http.response.header.x-db"), "REDACTED", "and one whose password holds a backslash");
	t.strictEqual(attr("http.response.header.x-db2"), "REDACTED", "and one opened by a mixed /\\");
	t.strictEqual(attr("http.response.header.x-frag"), "REDACTED", "and one with a listed key after a ? in its fragment");
	t.strictEqual(attr("http.response.header.x-frag2"), "REDACTED", "and one with a listed key opening its fragment");
	t.strictEqual(attr("http.response.header.x-opaque"), "REDACTED", "and one with a single colon, http:u:pw@host");
	t.strictEqual(attr("http.response.header.x-slash"), "REDACTED", "and one with a single slash, https:/u:pw@host");
	t.strictEqual(attr("http.response.header.set-cookie"), "REDACTED", "an allow-listed set-cookie records its presence, not its value");
	t.ok(!JSON.stringify(calls.filter(call => call.path.startsWith("/v1/"))).includes("hunter2"), "no credential reaches the collector");
	t.end();
});

test("log.fetch marks error spans for 4xx and for network failures, propagating each outcome", async t => {
	const { calls } = stubFetch(path => {
		if (path === "/missing") return response({ status: 404 });
		if (path === "/boom") throw Object.assign(new Error("down"), { code: "ECONNREFUSED" });
		if (path === "/abort") throw new DOMException("aborted", "AbortError");
		if (path === "/bare") throw "bare";
		if (path.startsWith("/a/")) throw new Error("fetch failed: https://api.test/a/https:%2F%2Fu:hunter3%40z/b");

		return undefined;
	});
	const log = new Log({ otlpHttpBaseURI: "http://127.0.0.1:4318", stderr: () => {} });

	// A 4xx is a returned response, not an exception.
	const res = await log.fetch("https://api.test/missing");

	t.strictEqual(res.status, 404, "a 4xx response is still returned");

	// A network failure re-throws unchanged.
	let threw = false;

	try {
		await log.fetch("https://api.test/boom");
	} catch {
		threw = true;
	}
	t.ok(threw, "the underlying network error propagates to the caller");

	await log.fetch("https://api.test/abort").catch(() => {});
	await log.fetch("https://api.test/bare").catch(() => {});
	await log.fetch("https://api.test/a/https:%2F%2Fu:hunter3%40z/b").catch(() => {});
	await log.end();

	const spans = exportedSpans(calls);
	const attr = (span: any, key: string) => span.attributes.find((attribute: any) => attribute.key === key)?.value.stringValue;
	const span404 = spans.find(span => attr(span, "http.response.status_code") === "404")!;
	const spanBoom = spans.find(span => attr(span, "error.type") === "ECONNREFUSED")!;

	t.deepEqual(span404.status, { code: 2 }, "the 4xx span is ERROR without a status message");
	t.deepEqual(spanBoom.status, { code: 2, message: "down" }, "the network-failure span is ERROR with the error message");
	t.strictEqual(attr(spanBoom, "error.type"), "ECONNREFUSED", "error.type captured from the error code");
	t.ok(spans.some(span => attr(span, "error.type") === "20"), "a numeric code (DOMException) is kept, as v2.3.0 documented");
	t.ok(spans.some(span => attr(span, "error.type") === "fetch_error"), "error.type is \"fetch_error\" when there is neither code nor name");
	t.ok(spans.some(span => span.status.message === "fetch failed: https://api.test/a/REDACTED"), "the url the runtime quotes back is redacted as the known url, its path's nested userinfo included");
	t.end();
});

test("log.fetch keeps a caller-supplied traceparent", async t => {
	const { calls } = stubFetch();
	const log = new Log({ otlpHttpBaseURI: "http://127.0.0.1:4318", stderr: () => {} });
	const supplied = formatTraceparent(generateTraceId(), generateSpanId());

	await log.fetch("https://api.test/x", { headers: { traceparent: supplied } });
	await log.end();

	t.strictEqual(callHeader(calls.find(call => call.path === "/x")!, "traceparent"), supplied, "the caller's traceparent is not overwritten");
	t.end();
});

test("await log.end() drains a fire-and-forget log.fetch span, and its rejection still goes unhandled", async t => {
	const { calls } = stubFetch(path => {
		if (path === "/fail") throw new TypeError("network down");

		return undefined;
	});
	const log = new Log({ otlpHttpBaseURI: "http://127.0.0.1:4318", stderr: () => {} });
	const unhandled: unknown[] = [];
	const onNode = (reason: unknown) => { unhandled.push(reason); };
	const onBrowser = (event: PromiseRejectionEvent) => { event.preventDefault(); unhandled.push(event.reason); };
	const nodeProcess = typeof process === "undefined" ? undefined : process;

	nodeProcess?.on("unhandledRejection", onNode);
	globalThis.addEventListener?.("unhandledrejection", onBrowser);

	log.fetch("https://api.test/bg"); // deliberately NOT awaited
	log.fetch("https://api.test/fail"); // deliberately NOT awaited

	await log.end();
	await waitFor(() => unhandled.length > 0);
	nodeProcess?.off("unhandledRejection", onNode);
	globalThis.removeEventListener?.("unhandledrejection", onBrowser);

	// The span must be delivered by the time end() resolves, else a short-lived process would exit first.
	t.strictEqual(exportedSpans(calls).find(span => span.kind === 3 && span.status.code !== 2)?.name, "GET api.test", "the client span was exported before end() resolved");
	t.strictEqual(unhandled.length, 1, "a rejection nobody awaited reaches the runtime, as plain fetch's would");
	t.end();
});

test("log.fetch skips an invalid name in captureRequestHeaders or captureResponseHeaders and warns once per stderr", async t => {
	const { calls } = stubFetch(path => path === "/x" ? response({ headers: new Headers({ "x-resp": "rv" }) }) : undefined);
	const { log, stderr } = capture({ captureRequestHeaders: ["X-Api-Key: hunter2", "x-req"], captureResponseHeaders: ["x-resp", "bad\nname"], format: "json", otlpHttpBaseURI: "http://127.0.0.1:4318" });

	for (let i = 0; i < 2; i++) {
		t.strictEqual((await log.fetch("https://api.test/x", { headers: { "x-req": "rq" } })).status, 200, `call ${i + 1} resolves with the platform's response`);
	}

	await log.end();

	const span = clientSpan(calls);
	const attr = (key: string) => span.attributes.find((attribute: any) => attribute.key === key)?.value.stringValue;

	t.deepEqual([attr("http.request.header.x-req"), attr("http.response.header.x-resp"), span.status.code], ["rq", "rv", 0], "the valid names are captured and the span is no error");
	t.deepEqual(stderr.map(line => [JSON.parse(line).logLevel, JSON.parse(line).msg]), [
		["warn", "@larvit/log: captureRequestHeaders[0] is not a valid header name, so log.fetch skips it"],
		["warn", "@larvit/log: captureResponseHeaders[1] is not a valid header name, so log.fetch skips it"],
	], "each invalid name warns once per stderr, by index, never echoing it");

	const untyped = capture({ captureResponseHeaders: [null as unknown as string] });

	t.strictEqual((await untyped.log.fetch("https://api.test/x")).status, 200, "a name that is no string is skipped too");
	t.strictEqual(untyped.stderr.length, 1, "with its warning");

	const broken = new Log({ captureRequestHeaders: ["bad name"], stderr: () => { throw new Error("stderr closed"); } });

	t.strictEqual((await broken.fetch("https://api.test/x")).status, 200, "a stderr that throws on the warning never changes the result");
	t.end();
});

test("log.fetch with an invalid header rejects but never hangs end()", async t => {
	const { calls } = stubFetch();
	const log = new Log({ otlpHttpBaseURI: "http://127.0.0.1:4318", stderr: () => {} });

	let threw = false;

	try {
		// An invalid header name makes `new Headers()` throw during setup, before the request goes out.
		await log.fetch("https://api.test/x", { headers: { "bad header name": "v" } });
	} catch {
		threw = true;
	}

	// Must resolve, not hang — the tracked promise has to settle even when setup throws.
	await log.end();

	t.ok(threw, "the setup error propagates to the caller");
	t.strictEqual(clientSpan(calls).status.code, 2, "an error span is still exported for the failed call");
	t.end();
});

test("a clock whose now() is fractional or throws never changes a log.fetch result or hangs end()", async t => {
	const { calls } = stubFetch();
	const timers = { clearTimeout: (timer?: TimerHandle) => clearTimeout(timer), setTimeout: (callback: () => void, delayMs: number) => setTimeout(callback, delayMs) };
	const fractional = new Log({ clock: { ...timers, now: () => 1758150000000.3 }, otlpHttpBaseURI: "http://127.0.0.1:4318", stderr: () => {}, stdout: () => {} });

	fractional.info("record");
	await fractional.fetch("https://api.test/x");
	await fractional.end();
	t.ok(clientSpan(calls).startTimeUnixNano.startsWith("1758150000000300"), "a fraction of a millisecond is kept");
	t.deepEqual(exportedRecords(calls), ["record"], "and the record is exported");

	let broken = false;
	const brokenNow = () => {
		if (broken) throw new Error("clock broke");

		return Date.now();
	};
	const throwing = new Log({ clock: { ...timers, now: brokenNow }, otlpHttpBaseURI: "http://127.0.0.1:4318", stderr: () => {}, stdout: () => {} });

	throwing.info("before");
	stubFetch(path => {
		if (path === "/closes") broken = true;

		return undefined;
	});
	t.strictEqual((await throwing.fetch("https://api.test/closes")).status, 200, "a now() throwing as the span closes leaves the platform's response");
	t.strictEqual((await throwing.fetch("https://api.test/opens")).status, 200, "and one throwing as it opens still sends the request");

	const { calls: ended } = stubFetch();

	t.strictEqual(await throwing.end().then(() => "resolved", () => "rejected"), "rejected", "end() rejects on the clock, never hangs");
	t.deepEqual(exportedRecords(ended), ["before"], "and still delivers what was queued");
	t.end();
});

test("log.fetch throws when the log is already ended", async t => {
	const log = new Log({ stderr: () => {} });

	await log.end();
	t.throws(() => log.fetch("https://api.test/x"), "fetch on an ended log throws, like the log methods");
	t.end();
});

test("log.fetch works without OTLP, still injecting a traceparent", async t => {
	const { calls } = stubFetch();
	const log = new Log({ stderr: () => {} });

	const res = await log.fetch("https://api.test/x");

	await log.end();

	t.strictEqual(res.status, 200, "fetch still returns the response");
	t.ok(calls.every(call => call.path !== "/v1/traces"), "no span is exported when OTLP is not configured");
	t.ok(callHeader(calls.find(call => call.path === "/x")!, "traceparent"), "traceparent is still injected for downstream continuation");
	t.end();
});

test("isCredentialHeaderName tells a credential header from any other, read from its own module", t => {
	t.strictEqual(isCredentialHeaderName("Authorization"), true, "Authorization is a credential header");
	t.strictEqual(isCredentialHeaderName("Content-Type"), false, "Content-Type is not");
	t.end();
});

function fetchTrace(over: Partial<FetchTrace> = {}): FetchTrace & { warnings: string[] } {
	const warnings: string[] = [];
	const clock = { clearTimeout: () => {}, now: () => 1700000000000, setTimeout: () => 1 };
	const randomBytes = (size: number) => new Uint8Array(size).fill(7);
	const { sampled, span } = openSpan({ clock, randomBytes });

	return { clock, context: { "service.name": "svc" }, randomBytes, sampled, span, warn: msg => { warnings.push(msg); }, warnings, ...over };
}

test("requestAttributes drops the query and keeps the port, scheme and context", t => {
	const attributes = requestAttributes(fetchTrace(), new URL("https://api.test:8443/users?token=secret"), "GET");

	t.deepEqual(attributes, {
		"http.request.method": "GET",
		"server.address": "api.test",
		"server.port": 8443,
		"service.name": "svc",
		"url.full": "https://api.test:8443/users",
		"url.scheme": "https",
	}, "no token, no query");
	t.end();
});

test("capturedHeaders captures a named request header and redacts a credential one", t => {
	const headers = new Headers({ Authorization: "Bearer abc", "X-Request-Id": "r1" });
	const attributes = capturedHeaders(fetchTrace({ captureRequestHeaders: ["X-Request-Id", "Authorization"] }), "captureRequestHeaders", headers);

	t.strictEqual(attributes["http.request.header.x-request-id"], "r1", "the plain header is captured");
	t.strictEqual(attributes["http.request.header.authorization"], "REDACTED", "the credential is not");
	t.end();
});

test("capturedHeaders warns of a header name it can't read, by position and not by name", t => {
	const trace = fetchTrace({ captureRequestHeaders: ["bad name: value"] });

	capturedHeaders(trace, "captureRequestHeaders", new Headers());
	t.deepEqual(trace.warnings, ["@larvit/log: captureRequestHeaders[0] is not a valid header name, so log.fetch skips it"], "the index stands in for the name");
	t.end();
});

test("responseAttributes records the status and a captured response header", t => {
	const res = new Response(null, { headers: { "X-Trace": "t1" }, status: 503 });

	t.deepEqual(responseAttributes(fetchTrace({ captureResponseHeaders: ["X-Trace"] }), res), { "http.response.header.x-trace": "t1", "http.response.status_code": 503 }, "status and header");
	t.end();
});

test("spanStatusCode leaves a 399 status unset", t => {
	t.strictEqual(spanStatusCode(399), STATUS_CODE_UNSET, "not an error");
	t.end();
});

test("spanStatusCode marks a 400 status as an error", t => {
	t.strictEqual(spanStatusCode(400), STATUS_CODE_ERROR, "an error");
	t.end();
});

test("fetchFailure names the error by its code, else its name, else fetch_error", t => {
	const url = new URL("https://api.test/");
	const named = Object.assign(new TypeError("x"), { code: "ECONNREFUSED" });

	t.strictEqual(fetchFailure(named, url).errorType, "ECONNREFUSED", "code first");
	t.strictEqual(fetchFailure(new TypeError("x"), url).errorType, "TypeError", "then name");
	t.strictEqual(fetchFailure("boom", url).errorType, "fetch_error", "then the fallback");
	t.end();
});
