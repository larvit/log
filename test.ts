import { generateSpanId, generateTraceId, Log, type LogConf, LogLevels, msgJsonFormatter } from "./index.js";
import test from "./tap.js";

// --- helpers ---------------------------------------------------------------

function isNanoTimestampWithinHour(str: string): boolean {
	if (!/^\d+$/.test(str)) {
		return false;
	}

	const unixTimestamp = Math.round(parseInt(str) / 1000000000); // nanosecond to second
	const now = Math.floor(Date.now() / 1000); // millisecond to second
	const hourInSeconds = 3600;

	// Check if number is a reasonable Unix timestamp (after 2020-01-01)
	if (unixTimestamp > 1577836800) {
		return Math.abs(now - unixTimestamp) <= hourInSeconds;
	}

	return false;
}

// Build a Log whose console output is captured into arrays instead of touching the real console.
// Works in any runtime (no process.stdout patching).
function capture(conf?: ConstructorParameters<typeof Log>[0]) {
	const stderr: string[] = [];
	const stdout: string[] = [];
	const opts: LogConf = typeof conf === "object" ? { ...conf } : { logLevel: conf };

	opts.stderr = line => { stderr.push(line); };
	opts.stdout = line => { stdout.push(line); };

	return { log: new Log(opts), stderr, stdout };
}

function okResponse(json: unknown = { partialSuccess: {} }) {
	// eslint-disable-next-line id-length -- "ok" mirrors the fetch Response shape the transport reads
	return { json: () => Promise.resolve(json), ok: true, status: 200 };
}

// Replace the global fetch with a recording stub. Works in Node and the browser, so the OTLP
// transport can be asserted without a real HTTP server (deterministic, no express dependency).
// The harness restores globalThis.fetch after each test, so callers never restore it themselves.
function stubFetch(responder?: (path: string, body: unknown) => ReturnType<typeof okResponse> | undefined) {
	const calls: { body: any, contentType: string, path: string, rawBody: any, url: string }[] = [];

	globalThis.fetch = (async (url: string, init: { body: any, headers: Record<string, string> }) => {
		const contentType = init.headers?.["Content-Type"];
		const path = new URL(String(url)).pathname;
		// Only JSON bodies are parsed; protobuf bodies are raw bytes, inspected via rawBody.
		const body = contentType === "application/json" ? JSON.parse(init.body) : undefined;

		calls.push({ body, contentType, path, rawBody: init.body, url: String(url) });

		return responder?.(path, body) ?? okResponse();
	}) as unknown as typeof fetch;

	return { calls };
}

// --- protobuf decode (test-only, zero-dep) ---------------------------------
// Minimal reader that verifies the hand-rolled OTLP protobuf encoder: it decodes the wire bytes
// back into the shape the JSON transport builds, so the same facts can be asserted. Field numbers
// mirror the OTLP proto definitions. Independent of the encoder (own varint/fixed64 reader), so an
// encoder bug can't be masked by symmetric reuse.

function pbReadVarint(buf: Uint8Array, pos: number): [bigint, number] {
	let result = 0n;
	let shift = 0n;
	let cursor = pos;

	for (;;) {
		const byte = buf[cursor++];

		result |= BigInt(byte & 0x7f) << shift;
		if ((byte & 0x80) === 0) break;
		shift += 7n;
	}

	return [result, cursor];
}

// Group one message's fields by field number. Values: bigint (varint/fixed64) or Uint8Array (len-delimited).
function pbDecode(buf: Uint8Array): Map<number, (bigint | Uint8Array)[]> {
	const fields = new Map<number, (bigint | Uint8Array)[]>();
	let pos = 0;

	while (pos < buf.length) {
		const [tag, afterTag] = pbReadVarint(buf, pos);

		pos = afterTag;
		const fieldNo = Number(tag >> 3n);
		const wireType = Number(tag & 0x7n);
		let value: bigint | Uint8Array;

		if (wireType === 0) {
			[value, pos] = pbReadVarint(buf, pos);
		} else if (wireType === 1) {
			let acc = 0n;

			for (let i = 7; i >= 0; i--) acc = (acc << 8n) | BigInt(buf[pos + i]);
			value = acc;
			pos += 8;
		} else if (wireType === 2) {
			let len: bigint;

			[len, pos] = pbReadVarint(buf, pos);
			value = buf.slice(pos, pos + Number(len));
			pos += Number(len);
		} else {
			throw new Error(`unsupported wire type ${wireType}`);
		}

		const arr = fields.get(fieldNo) ?? [];

		arr.push(value);
		fields.set(fieldNo, arr);
	}

	return fields;
}

const pbStr = (bytes: bigint | Uint8Array) => new TextDecoder().decode(bytes as Uint8Array);
const pbHex = (bytes: bigint | Uint8Array) => Array.from(bytes as Uint8Array).map(byte => byte.toString(16).padStart(2, "0")).join("");
const pbMsg = (field: bigint | Uint8Array) => pbDecode(field as Uint8Array);

// KeyValue { key=1: string, value=2: AnyValue { string_value=1 } }
function pbKeyValue(bytes: bigint | Uint8Array) {
	const fields = pbDecode(bytes as Uint8Array);

	return { key: pbStr(fields.get(1)![0]), value: { stringValue: pbStr(pbMsg(fields.get(2)![0]).get(1)![0]) } };
}

// Resource { attributes=1: repeated KeyValue }
const pbResourceAttrs = (bytes: bigint | Uint8Array) => (pbDecode(bytes as Uint8Array).get(1) ?? []).map(pbKeyValue);

// ExportLogsServiceRequest -> ResourceLogs[0] -> ScopeLogs[0] -> LogRecord[0]
function pbDecodeLogs(buf: Uint8Array) {
	const resLog = pbMsg(pbDecode(buf).get(1)![0]);
	const rec = pbMsg(pbMsg(resLog.get(2)![0]).get(2)![0]);

	return {
		logRecord: {
			attributes: (rec.get(6) ?? []).map(pbKeyValue),
			body: pbStr(pbMsg(rec.get(5)![0]).get(1)![0]),
			severityNumber: Number(rec.get(2)![0]),
			severityText: pbStr(rec.get(3)![0]),
			spanId: pbHex(rec.get(10)![0]),
			timeUnixNano: String(rec.get(1)![0]),
			traceId: pbHex(rec.get(9)![0]),
		},
		resourceAttrs: pbResourceAttrs(resLog.get(1)![0]),
	};
}

// ExportTraceServiceRequest -> ResourceSpans[0] -> ScopeSpans[0] -> Span[0]
function pbDecodeSpans(buf: Uint8Array) {
	const resSpan = pbMsg(pbDecode(buf).get(1)![0]);
	const scopeSpan = pbMsg(resSpan.get(2)![0]);
	const span = pbMsg(scopeSpan.get(2)![0]);

	return {
		resourceAttrs: pbResourceAttrs(resSpan.get(1)![0]),
		scopeName: pbStr(pbMsg(scopeSpan.get(1)![0]).get(1)![0]), // ScopeSpans.scope (msg) -> InstrumentationScope.name

		span: {
			attributes: (span.get(9) ?? []).map(pbKeyValue),
			endTimeUnixNano: String(span.get(8)![0]),
			kind: Number(span.get(6)![0]),
			name: pbStr(span.get(5)![0]),
			spanId: pbHex(span.get(2)![0]),
			startTimeUnixNano: String(span.get(7)![0]),
			statusCode: span.get(15) ? Number(pbMsg(span.get(15)![0]).get(3)?.[0] ?? 0n) : 0,
			traceId: pbHex(span.get(1)![0]),
		},
	};
}

// --- console output --------------------------------------------------------

test("Should log to info.", t => {
	const { log, stdout } = capture();

	log.info("flurp");
	t.strictEqual(stdout[0].substring(19), "Z [\x1b[1;32minf\x1b[0m] flurp", "\"flurp\" is in the inf log output");
	t.end();
});

test("Should log to error.", t => {
	const { log, stderr } = capture();

	log.error("burp");
	t.strictEqual(stderr[0].substring(19), "Z [\x1b[1;31merr\x1b[0m] burp", "\"burp\" is in the err log output");
	t.end();
});

test("Should not print debug by default.", t => {
	const { log, stdout } = capture();

	log.debug("nai");
	t.strictEqual(stdout.length, 0, "debug is not logged at the default level");
	t.end();
});

test("Should print debug when given \"silly\" as level.", t => {
	const { log, stdout } = capture("silly");

	log.debug("wapp");
	t.strictEqual(stdout[0].substring(19), "Z [\x1b[1;35mdeb\x1b[0m] wapp", "\"wapp\" is in the deb log output");
	t.end();
});

test("Print nothing, even on error, when no valid level is set.", t => {
	const { log, stderr } = capture("none");

	log.error("kattbajs");
	t.strictEqual(stderr.length, 0, "Nothing is written at level \"none\"");
	t.end();
});

test("Test silly.", t => {
	const { log, stdout } = capture("silly");

	log.silly("kattbajs");
	t.strictEqual(stdout[0].substring(19), "Z [\x1b[1;37msil\x1b[0m] kattbajs");
	t.end();
});

test("Test debug", t => {
	const { log, stdout } = capture("debug");

	log.debug("kattbajs");
	t.strictEqual(stdout[0].substring(19), "Z [\x1b[1;35mdeb\x1b[0m] kattbajs", "Debug level is output to stdout");
	t.end();
});

test("Test verbose", t => {
	const { log, stdout } = capture("verbose");

	log.verbose("kattbajs");
	t.strictEqual(stdout[0].substring(19), "Z [\x1b[1;34mver\x1b[0m] kattbajs");
	t.end();
});

test("Test info", t => {
	const { log, stdout } = capture("info");

	log.info("kattbajs");
	t.strictEqual(stdout[0].substring(19), "Z [\x1b[1;32minf\x1b[0m] kattbajs");
	t.end();
});

test("Test warn", t => {
	const { log, stderr } = capture("warn");

	log.warn("kattbajs");
	t.strictEqual(stderr[0].substring(19), "Z [\x1b[1;33mwar\x1b[0m] kattbajs");
	t.end();
});

test("Test error", t => {
	const { log, stderr } = capture("silly");

	log.error("kattbajs");
	t.strictEqual(stderr[0].substring(19), "Z [\x1b[1;31merr\x1b[0m] kattbajs");
	t.end();
});

test("Test initializing with options object", t => {
	const { log, stderr } = capture({ logLevel: "error" });

	log.error("an error");
	t.strictEqual(stderr[0].substring(19), "Z [\x1b[1;31merr\x1b[0m] an error");
	t.end();
});

test("Default level is info if nothing else is specified", t => {
	const { log, stdout } = capture({ logLevel: undefined });

	log.info("information");
	t.ok(stdout[0].includes(" information"), "info is logged at the default level");
	log.verbose("not logged");
	t.strictEqual(stdout.length, 1, "verbose is not logged at the default level");
	t.end();
});

test("Test only errors are logged if log level is error", t => {
	const { log, stderr, stdout } = capture("error");

	log.silly("kattbajs");
	log.debug("kattbajs");
	log.verbose("kattbajs");
	t.strictEqual(stdout.length, 0, "silly/debug/verbose are not logged at level error");

	log.warn("kattbajs");
	t.strictEqual(stderr.length, 0, "warn is not logged at level error");

	log.error("kattbajs");
	t.ok(stderr[0].includes(" kattbajs"), "error is logged at level error");
	t.end();
});

test("Test with metadata", t => {
	const { log, stdout } = capture("info");

	log.info("kattbajs", { foo: "bar" });
	t.strictEqual(stdout[0].split(" kattbajs ")[1].trim(), "{\"foo\":\"bar\"}", "Metadata is included in output");
	t.end();
});

test("Test with context", t => {
	const { log, stdout } = capture({ context: { bosse: "bäng", hasse: "luring" } });

	log.info("kattbajs", { foo: "bar" });
	t.strictEqual(
		stdout[0].split(" kattbajs ")[1].trim(),
		"{\"foo\":\"bar\",\"bosse\":\"bäng\",\"hasse\":\"luring\"}",
		"Metadata and context are included in output",
	);
	t.end();
});

test("Json stringifyer", t => {
	const { log, stdout } = capture({ context: { hello: "yo" }, format: "json" });

	log.info("bosse", { foo: "frasse" });
	const parsed = JSON.parse(stdout[0]);

	t.strictEqual(parsed.foo, "frasse", "Metadata foo is \"frasse\"");
	t.strictEqual(parsed.hello, "yo", "Context is in the json");
	t.strictEqual(parsed.logLevel, "info", "logLevel is set");
	t.strictEqual(parsed.msg, "bosse", "msg is set to \"bosse\"");
	t.end();
});

test("Copy instance", t => {
	const log = new Log({ context: { foo: "bar" } });
	const newLog = log.clone({ context: { baz: "fu" }, logLevel: "error" });
	const newLog2 = log.clone({ context: { foo: "burp" } });

	t.strictEqual(JSON.stringify(newLog.context), "{\"foo\":\"bar\",\"baz\":\"fu\"}", "Context is merged in newLog.");
	t.strictEqual(JSON.stringify(newLog2.context), "{\"foo\":\"burp\"}", "Context is merged in newLog2.");
	t.end();
});

test("msgJsonFormatter does not mutate input and is undefined-safe", t => {
	const meta = { count: 5, user: "abc" };
	const parsed = JSON.parse(msgJsonFormatter({ logLevel: "info", metadata: meta, msg: "hi" }));

	t.strictEqual(parsed.user, "abc", "user metadata preserved");
	t.strictEqual(parsed.count, 5, "number metadata stays a number in JSON output");
	t.strictEqual(parsed.msg, "hi", "msg present");
	t.strictEqual(parsed.logLevel, "info", "logLevel present");
	t.deepEqual(meta, { count: 5, user: "abc" }, "caller metadata object is NOT mutated");

	const parsed2 = JSON.parse(msgJsonFormatter({ logLevel: "error", msg: "boom" }));

	t.strictEqual(parsed2.msg, "boom", "undefined metadata does not throw");
	t.end();
});

test("verbose is ranked more severe than debug in OTLP severity", t => {
	t.ok(LogLevels.verbose.severityNumber > LogLevels.debug.severityNumber, "verbose severityNumber > debug severityNumber");
	t.end();
});

test("generateSpanId/generateTraceId produce valid, unique hex ids", t => {
	t.ok(/^[0-9a-f]{16}$/.test(generateSpanId()), "spanId is 16 hex chars");
	t.ok(/^[0-9a-f]{32}$/.test(generateTraceId()), "traceId is 32 hex chars");
	t.notStrictEqual(generateSpanId(), generateSpanId(), "two span ids differ");
	t.end();
});

test("printTraceInfo appends span/trace info to output", t => {
	const { log, stdout } = capture({ printTraceInfo: true, spanName: "my-span" });

	log.info("hello");
	t.ok(stdout[0].includes("spanId"), "output contains spanId");
	t.ok(stdout[0].includes("traceId"), "output contains traceId");
	t.ok(stdout[0].includes("my-span"), "output contains span name");
	t.end();
});

test("clone can downgrade json format to text", t => {
	const stdout: string[] = [];
	const textLog = new Log({ format: "json" }).clone({ format: "text", stdout: line => stdout.push(line) });

	textLog.info("plain");
	t.throws(() => JSON.parse(stdout[0]), "text clone output is not JSON");
	t.ok(stdout[0].includes("plain"), "message present in text output");
	t.end();
});

test("clone() inherits OTLP config and printTraceInfo, but keeps its own span", async t => {
	const { calls } = stubFetch();
	const stdout: string[] = [];
	const base = new Log({
		otlpHttpBaseURI: "http://127.0.0.1:4318",
		otlpProtocol: "http/protobuf",
		printTraceInfo: true,
		stderr: () => {},
		stdout: line => stdout.push(line),
	});

	const child = base.clone({ context: { cloned: "yes" } });

	child.info("from clone");
	await child.end();

	// OTLP endpoint + protocol are inherited: the clone actually exports, and as protobuf.
	t.ok(calls.some(call => call.path === "/v1/logs"), "clone exported a log to the inherited OTLP endpoint");
	t.ok(calls.length > 0 && calls.every(call => call.contentType === "application/x-protobuf"), "clone inherited otlpProtocol http/protobuf");

	// printTraceInfo is inherited: console output carries span/trace info.
	t.ok(stdout[0].includes("spanId"), "clone inherited printTraceInfo");

	// ...but the clone is its own span, not a child of base.
	t.notStrictEqual(child.span.traceId, base.span.traceId, "clone has its own traceId, not base's");
	t.end();
});

test("constructor throws on malformed otlpHttpBaseURI", t => {
	t.throws(() => new Log({ otlpHttpBaseURI: "not a valid uri" }), "malformed otlpHttpBaseURI throws at construction");
	t.doesNotThrow(() => new Log({ otlpHttpBaseURI: "http://127.0.0.1:4318" }), "valid uri does not throw");
	t.end();
});

test("child log does not share its context object with the parent", t => {
	const parent = new Log({ context: { service: "x" } });
	const child = new Log({ parentLog: parent });

	t.notStrictEqual(child.context, parent.context, "child has its own context object");
	t.strictEqual(child.context.service, "x", "child inherits parent context values");

	child.context.extra = "y";
	t.strictEqual(parent.context.extra, undefined, "child context mutation does not leak to parent");
	t.end();
});

// --- OTLP transport (fetch-stubbed) ----------------------------------------

test("end() returns an awaitable promise and OTLP failure is handled without hanging", async t => {
	stubFetch(() => { throw new Error("connection refused"); });
	const stderr: string[] = [];
	const log = new Log({ otlpHttpBaseURI: "http://127.0.0.1:1", stderr: line => stderr.push(line) });

	log.error("will fail to export");
	const ret = log.end();

	t.ok(ret && typeof ret.then === "function", "end() returns a thenable");
	await ret;

	t.ok(stderr.join("\n").includes("127.0.0.1:1"), "the OTLP export error (incl. endpoint url) is written to stderr");
	t.end();
});

test("OTLP preserves a base path from otlpHttpBaseURI", async t => {
	const { calls } = stubFetch();
	const log = new Log({ otlpHttpBaseURI: "http://127.0.0.1:4318/otel", stderr: () => {} });

	log.error("with base path");
	await log.end();

	t.deepEqual(calls.map(call => call.path).sort(), ["/otel/v1/logs", "/otel/v1/traces"], "base path /otel is kept on both endpoints");
	t.end();
});

test("OLTP simple log", async t => {
	const { calls } = stubFetch();
	const log = new Log({ otlpHttpBaseURI: "http://127.0.0.1:4318", stderr: () => {} });

	log.error("Gir in da house!");
	await log.end();

	const logsBody: any = calls.find(call => call.path === "/v1/logs")?.body;
	const tracesBody: any = calls.find(call => call.path === "/v1/traces")?.body;

	t.ok(logsBody, "a /v1/logs call was made");
	t.ok(tracesBody, "a /v1/traces call was made");
	t.ok(calls.every(call => call.contentType === "application/json"), "default protocol sends JSON content-type");

	t.strictEqual(logsBody.resourceLogs.length, 1, "Exactly one resourceLog in /v1/logs body");
	t.strictEqual(logsBody.resourceLogs[0].scopeLogs.length, 1, "Exactly one scopeLog in /v1/logs body");
	t.strictEqual(logsBody.resourceLogs[0].scopeLogs[0].logRecords.length, 1, "Exactly one logRecord in /v1/logs body");

	const logRecord = logsBody.resourceLogs[0].scopeLogs[0].logRecords[0];

	t.strictEqual(logRecord.body.stringValue, "Gir in da house!", "logRecord.body is correct");
	t.strictEqual(logRecord.severityNumber, 17, "logRecord.severityNumber is correct");
	t.strictEqual(logRecord.severityText, "ERROR", "logRecord.severityText is correct");
	t.notStrictEqual(logRecord.traceId.length, 0, "logRecord.traceId has a non-zero length");
	t.ok(isNanoTimestampWithinHour(logRecord.timeUnixNano), "timeUnixNano is reasonable");

	t.strictEqual(tracesBody.resourceSpans.length, 1, "Exactly one resourceSpan in /v1/traces body");
	t.strictEqual(tracesBody.resourceSpans[0].scopeSpans.length, 1, "Exactly one scopeSpan in /v1/traces body");
	t.strictEqual(tracesBody.resourceSpans[0].scopeSpans[0].spans.length, 1, "Exactly one span in /v1/traces body");

	const span = tracesBody.resourceSpans[0].scopeSpans[0].spans[0];

	t.strictEqual(span.kind, 1, "Span kind is always 1");
	t.strictEqual(typeof span.name, "string", "span.name is a string");
	t.notStrictEqual(span.name.length, 0, "span.name has a non-zero length");
	t.notStrictEqual(span.spanId.length, 0, "span.spanId has a non-zero length");
	t.strictEqual(span.traceId, logRecord.traceId, "span.traceId matches the log traceId");
	t.ok(isNanoTimestampWithinHour(span.endTimeUnixNano), "span.endTimeUnixNano is reasonable");
	t.ok(isNanoTimestampWithinHour(span.startTimeUnixNano), "span.startTimeUnixNano is reasonable");
	t.end();
});

test("OLTP simple log with metadata", async t => {
	const { calls } = stubFetch();
	const log = new Log({
		context: { "service.name": "eva-bosse" },
		otlpHttpBaseURI: "http://127.0.0.1:4318",
		spanName: "lur-bert",
	});

	log.warn("FOo", { active: true, bar: "baz", "lökig knasnyckel | typ": 17 });
	await log.end();

	const logsBody: any = calls.find(call => call.path === "/v1/logs")?.body;
	const tracesBody: any = calls.find(call => call.path === "/v1/traces")?.body;
	const logRecord = logsBody.resourceLogs[0].scopeLogs[0].logRecords[0];

	t.strictEqual(logRecord.body.stringValue, "FOo", "logRecord.body is correct");
	t.strictEqual(logRecord.severityNumber, 13, "logRecord.severityNumber is correct");
	t.strictEqual(logRecord.severityText, "WARN", "logRecord.severityText is correct");
	t.strictEqual(logRecord.attributes[0].key, "active", "First attribute is active");
	t.strictEqual(logRecord.attributes[0].value.stringValue, "true", "boolean metadata coerced to \"true\"");
	t.strictEqual(logRecord.attributes[1].key, "bar", "Second attribute is bar");
	t.strictEqual(logRecord.attributes[1].value.stringValue, "baz", "Second attribute value is baz");
	t.strictEqual(logRecord.attributes[2].key, "lökig knasnyckel | typ", "Third attribute key is correct");
	t.strictEqual(logRecord.attributes[2].value.stringValue, "17", "number metadata coerced to \"17\"");

	// service.name belongs on the log resource (this is what Grafana/Loki reads), not the log record.
	const logResourceAttrs = logsBody.resourceLogs[0].resource.attributes;

	t.strictEqual(logResourceAttrs.find((attr: any) => attr.key === "service.name").value.stringValue, "eva-bosse", "log resource service.name is eva-bosse");
	t.strictEqual(logResourceAttrs.find((attr: any) => attr.key === "telemetry.sdk.name").value.stringValue, "@larvit/log", "log resource telemetry.sdk.name is @larvit/log");
	t.notOk(logRecord.attributes.find((attr: any) => attr.key === "service.name"), "service.name is not duplicated in log record attributes");

	const traceResource = tracesBody.resourceSpans[0];

	t.strictEqual(traceResource.resource.attributes.length, 4, "Resource has 4 attributes");
	t.strictEqual(traceResource.resource.droppedAttributesCount, 0, "No attributes dropped");

	const findAttr = (key: string) => traceResource.resource.attributes.find((attr: any) => attr.key === key).value.stringValue;

	t.strictEqual(findAttr("service.name"), "eva-bosse", "service.name is eva-bosse");
	t.strictEqual(findAttr("telemetry.sdk.language"), "ecmascript", "telemetry.sdk.language is ecmascript");
	t.strictEqual(findAttr("telemetry.sdk.name"), "@larvit/log", "telemetry.sdk.name is @larvit/log");
	t.ok(/^\d+\.\d+\.\d+/.test(findAttr("telemetry.sdk.version")), "telemetry.sdk.version is a semver (build replaced __version__)");

	const scopedSpan = traceResource.scopeSpans[0];
	const span = scopedSpan.spans[0];

	t.strictEqual(scopedSpan.scope.name, "lur-bert", "Span scope name is lur-bert");
	t.strictEqual(span.name, "lur-bert", "Span name is lur-bert");
	t.strictEqual(span.traceId, logRecord.traceId, "traceId is the same in trace and log");
	t.strictEqual(span.spanId, logRecord.spanId, "spanId is the same in trace and log");
	t.strictEqual(span.kind, 1, "span kind is 1");
	t.strictEqual(span.attributes.length, 0, "Span attributes is an empty array");
	t.strictEqual(span.status.code, 0, "span status code is 0");
	t.strictEqual(span.links.length, 0, "span links is an empty array");
	t.strictEqual(span.droppedLinksCount, 0, "span has no dropped links");
	t.end();
});

test("OTLP protobuf encodes logs and spans on the wire", async t => {
	const { calls } = stubFetch();
	const log = new Log({
		context: { "service.name": "proto-svc" },
		otlpHttpBaseURI: "http://127.0.0.1:4318",
		otlpProtocol: "http/protobuf",
		spanName: "proto-span",
		stderr: () => {},
	});

	log.warn("protobuf works", { active: true, count: 17, foo: "bar" });
	await log.end();

	const logsCall = calls.find(call => call.path === "/v1/logs")!;
	const tracesCall = calls.find(call => call.path === "/v1/traces")!;

	t.strictEqual(logsCall.contentType, "application/x-protobuf", "logs are sent as protobuf");
	t.strictEqual(tracesCall.contentType, "application/x-protobuf", "traces are sent as protobuf");

	const { logRecord, resourceAttrs: logResourceAttrs } = pbDecodeLogs(logsCall.rawBody);
	const { resourceAttrs: spanResourceAttrs, scopeName, span } = pbDecodeSpans(tracesCall.rawBody);

	t.strictEqual(logRecord.body, "protobuf works", "decoded log body matches");
	t.strictEqual(logRecord.severityNumber, 13, "decoded severityNumber is WARN (13)");
	t.strictEqual(logRecord.severityText, "WARN", "decoded severityText is WARN");
	t.deepEqual(
		logRecord.attributes,
		[
			{ key: "active", value: { stringValue: "true" } },
			{ key: "count", value: { stringValue: "17" } },
			{ key: "foo", value: { stringValue: "bar" } },
		],
		"decoded log attributes match, values stringified",
	);
	t.strictEqual(logResourceAttrs.find(attr => attr.key === "service.name")!.value.stringValue, "proto-svc", "service.name is on the log resource");
	t.notOk(logRecord.attributes.find(attr => attr.key === "service.name"), "service.name is not duplicated in record attributes");
	t.ok(isNanoTimestampWithinHour(logRecord.timeUnixNano), "log timeUnixNano is reasonable");

	t.strictEqual(scopeName, "proto-span", "scope name is the span name");
	t.strictEqual(span.name, "proto-span", "decoded span name matches");
	t.strictEqual(span.kind, 1, "decoded span kind is 1");
	t.strictEqual(span.statusCode, 0, "decoded span status code is 0");
	t.strictEqual(span.traceId, logRecord.traceId, "span and log share the traceId");
	t.strictEqual(span.spanId, logRecord.spanId, "span and log share the spanId");
	t.strictEqual(spanResourceAttrs.find(attr => attr.key === "service.name")!.value.stringValue, "proto-svc", "service.name is on the span resource");
	t.ok(isNanoTimestampWithinHour(span.startTimeUnixNano), "span startTimeUnixNano is reasonable");
	t.ok(isNanoTimestampWithinHour(span.endTimeUnixNano), "span endTimeUnixNano is reasonable");
	t.end();
});

test("OLTP multiple instances should work independently", async t => {
	const { calls } = stubFetch();
	const otlp = { otlpHttpBaseURI: "http://127.0.0.1:4318", stderr: () => {} };

	const log1 = new Log({ context: { "service.name": "log1" }, ...otlp });

	log1.warn("rappakalja");
	await log1.end();

	const log2 = new Log({ context: { "service.name": "log2" }, ...otlp });

	log2.warn("bollhav");
	await log2.end();

	t.strictEqual(calls.length, 4, "two log exports + two trace exports");

	for (const call of calls.filter(call => call.path === "/v1/logs")) {
		const logRecord = call.body.resourceLogs[0].scopeLogs[0].logRecords[0];
		const serviceName = call.body.resourceLogs[0].resource.attributes.find((attr: any) => attr.key === "service.name").value.stringValue;

		if (logRecord.body.stringValue === "rappakalja") {
			t.strictEqual(serviceName, "log1", "service.name for rappakalja is log1");
		} else if (logRecord.body.stringValue === "bollhav") {
			t.strictEqual(serviceName, "log2", "service.name for bollhav is log2");
		} else {
			t.fail(`Unexpected log body: "${logRecord.body.stringValue}"`);
		}
	}

	t.end();
});
