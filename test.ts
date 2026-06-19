import { formatTraceparent, generateSpanId, generateTraceId, Log, type LogConf, type LogLevel, LogLevels, msgJsonFormatter, parseTraceparent } from "./index.js";
import test from "./tap.js";

// --- helpers ---------------------------------------------------------------

function isNanoTimestampWithinHour(str: string): boolean {
	if (!/^\d+$/.test(str)) {
		return false;
	}

	const unixTimestamp = Math.round(parseInt(str) / 1000000000); // ns -> s
	const now = Math.floor(Date.now() / 1000);

	// A plausible recent Unix timestamp: after 2020-01-01 and within an hour of now.
	return unixTimestamp > 1577836800 && Math.abs(now - unixTimestamp) <= 3600;
}

// Build a Log capturing console output into arrays (runtime-agnostic, no process.stdout patching).
function capture(conf?: ConstructorParameters<typeof Log>[0]) {
	const stderr: string[] = [];
	const stdout: string[] = [];
	const opts: LogConf = typeof conf === "object" ? { ...conf } : { logLevel: conf };

	opts.stderr = line => { stderr.push(line); };
	opts.stdout = line => { stdout.push(line); };

	return { log: new Log(opts), stderr, stdout };
}

// A minimal fetch Response stand-in. Defaults satisfy the OTLP transport (which reads .json());
// log.fetch tests override status/headers — log.fetch never reads the body.
function response({ headers, json = { partialSuccess: {} }, status = 200 }: { headers?: Headers, json?: unknown, status?: number } = {}) {
	// eslint-disable-next-line id-length -- "ok" mirrors the fetch Response shape
	return { headers: headers ?? new Headers(), json: () => Promise.resolve(json), ok: status < 400, status };
}

// Replace global fetch with a recording stub (Node + browser), so the OTLP transport is asserted
// without a real server. The harness restores globalThis.fetch after each test.
function stubFetch(responder?: (path: string, body: unknown) => ReturnType<typeof response> | undefined) {
	const calls: { body: any, contentType: string, headers: any, path: string, rawBody: any, url: string }[] = [];

	globalThis.fetch = (async (url: string, init: { body: any, headers: Record<string, string> }) => {
		const contentType = init.headers?.["Content-Type"];
		const path = new URL(String(url)).pathname;
		// Only JSON bodies are parsed; protobuf bodies are raw bytes, inspected via rawBody.
		const body = contentType === "application/json" ? JSON.parse(init.body) : undefined;

		calls.push({ body, contentType, headers: init.headers, path, rawBody: init.body, url: String(url) });

		return responder?.(path, body) ?? response();
	}) as unknown as typeof fetch;

	return { calls };
}

// Read a header from a recorded call, normalising plain-object and Headers shapes.
const callHeader = (call: { headers: any }, name: string) => new Headers(call.headers ?? {}).get(name);

// The exported CLIENT span (kind 3) among the /v1/traces calls — the one log.fetch creates.
function clientSpan(calls: { body: any, path: string }[]) {
	for (const call of calls.filter(call => call.path === "/v1/traces")) {
		const span = call.body.resourceSpans[0].scopeSpans[0].spans[0];

		if (span.kind === 3) {
			return span;
		}
	}

	throw new Error("no client span was exported");
}

// --- protobuf decode (test-only, zero-dep) ---------------------------------
// Independent reader (own varint/fixed64 logic) that decodes the hand-rolled OTLP protobuf back into
// the JSON transport's shape, so an encoder bug can't hide behind symmetric reuse. Field numbers
// mirror the OTLP proto definitions.

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
		scopeName: pbStr(pbMsg(scopeSpan.get(1)![0]).get(1)![0]), // ScopeSpans.scope -> InstrumentationScope.name

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

test("each level writes its colored token to the right stream", t => {
	const cases: { level: LogLevel, stream: "stderr" | "stdout", token: string }[] = [
		{ level: "error", stream: "stderr", token: "\x1b[1;31merr\x1b[0m" },
		{ level: "warn", stream: "stderr", token: "\x1b[1;33mwar\x1b[0m" },
		{ level: "info", stream: "stdout", token: "\x1b[1;32minf\x1b[0m" },
		{ level: "verbose", stream: "stdout", token: "\x1b[1;34mver\x1b[0m" },
		{ level: "debug", stream: "stdout", token: "\x1b[1;35mdeb\x1b[0m" },
		{ level: "silly", stream: "stdout", token: "\x1b[1;37msil\x1b[0m" },
	];

	for (const { level, stream, token } of cases) {
		const cap = capture("silly"); // silly passes every level through the filter

		cap.log[level]("msg");
		t.strictEqual(cap[stream][0]?.substring(19), `Z [${token}] msg`, `${level} -> ${stream} with its token`);
	}
	t.end();
});

test("respects the configured log-level threshold", t => {
	const def = capture(); // default level is info

	def.log.info("x");
	def.log.verbose("x");
	def.log.debug("x");
	t.strictEqual(def.stdout.length, 1, "default level passes info but not verbose/debug");

	const err = capture("error");

	err.log.silly("x");
	err.log.debug("x");
	err.log.verbose("x");
	err.log.warn("x");
	t.strictEqual(err.stdout.length + err.stderr.length, 0, "everything below error (incl. warn) is suppressed");
	err.log.error("x");
	t.strictEqual(err.stderr.length, 1, "error passes at level error");

	const silly = capture("silly");

	silly.log.debug("x");
	t.strictEqual(silly.stdout.length, 1, "debug passes at the lowest level");

	const none = capture("none");

	none.log.error("x");
	t.strictEqual(none.stderr.length, 0, "nothing is written at level none, not even error");
	t.end();
});

test("metadata and context appear in the output", t => {
	const meta = capture("info");

	meta.log.info("kattbajs", { foo: "bar" });
	t.strictEqual(meta.stdout[0].split(" kattbajs ")[1].trim(), "{\"foo\":\"bar\"}", "metadata is appended");

	const ctx = capture({ context: { bosse: "bäng", hasse: "luring" } });

	ctx.log.info("kattbajs", { foo: "bar" });
	t.strictEqual(
		ctx.stdout[0].split(" kattbajs ")[1].trim(),
		"{\"foo\":\"bar\",\"bosse\":\"bäng\",\"hasse\":\"luring\"}",
		"metadata and context are merged into the output",
	);
	t.end();
});

test("json format emits context, metadata, logLevel and msg", t => {
	const { log, stdout } = capture({ context: { hello: "yo" }, format: "json" });

	log.info("bosse", { foo: "frasse" });
	const parsed = JSON.parse(stdout[0]);

	t.strictEqual(parsed.foo, "frasse", "metadata is in the json");
	t.strictEqual(parsed.hello, "yo", "context is in the json");
	t.strictEqual(parsed.logLevel, "info", "logLevel is set");
	t.strictEqual(parsed.msg, "bosse", "msg is set");
	t.end();
});

test("msgJsonFormatter keeps native types, does not mutate input, is undefined-safe", t => {
	const meta = { count: 5, user: "abc" };
	const parsed = JSON.parse(msgJsonFormatter({ logLevel: "info", metadata: meta, msg: "hi" }));

	t.strictEqual(parsed.count, 5, "number metadata stays a number in JSON output");
	t.deepEqual(meta, { count: 5, user: "abc" }, "caller metadata is not mutated");
	t.doesNotThrow(() => msgJsonFormatter({ logLevel: "error", msg: "boom" }), "undefined metadata does not throw");
	t.end();
});

test("verbose ranks more severe than debug in OTLP severity", t => {
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

test("clone merges context (overrides win)", t => {
	const log = new Log({ context: { foo: "bar" } });

	t.strictEqual(JSON.stringify(log.clone({ context: { baz: "fu" } }).context), "{\"foo\":\"bar\",\"baz\":\"fu\"}", "new keys merge in");
	t.strictEqual(JSON.stringify(log.clone({ context: { foo: "burp" } }).context), "{\"foo\":\"burp\"}", "existing keys are overridden");
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

test("clone inherits config (OTLP, printTraceInfo, fetch policy) but keeps its own span", async t => {
	const { calls } = stubFetch();
	const stdout: string[] = [];
	const base = new Log({
		captureQuery: true,
		captureRequestHeaders: ["x-req"],
		captureResponseHeaders: ["x-resp"],
		otlpHttpBaseURI: "http://127.0.0.1:4318",
		otlpProtocol: "http/protobuf",
		printTraceInfo: true,
		stderr: () => {},
		stdout: line => stdout.push(line),
	});

	const child = base.clone({ context: { cloned: "yes" } });

	child.info("from clone");
	await child.end();

	// OTLP endpoint + protocol inherited: the clone actually exports, as protobuf.
	t.ok(calls.some(call => call.path === "/v1/logs"), "clone exports to the inherited OTLP endpoint");
	t.ok(calls.length > 0 && calls.every(call => call.contentType === "application/x-protobuf"), "clone inherited otlpProtocol http/protobuf");

	// log.fetch policy inherited.
	t.strictEqual(child.conf.captureQuery, true, "captureQuery inherited");
	t.deepEqual(child.conf.captureRequestHeaders, ["x-req"], "request header allow-list inherited");
	t.deepEqual(child.conf.captureResponseHeaders, ["x-resp"], "response header allow-list inherited");

	// printTraceInfo inherited.
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

	t.strictEqual(child.context.service, "x", "child inherits parent context values");
	child.context.extra = "y";
	t.strictEqual(parent.context.extra, undefined, "child context mutation does not leak to parent");
	t.end();
});

// --- OTLP transport (fetch-stubbed) ----------------------------------------

test("end() is awaitable and an OTLP export failure is reported without hanging", async t => {
	stubFetch(() => { throw new Error("connection refused"); });
	const stderr: string[] = [];
	const log = new Log({ otlpHttpBaseURI: "http://127.0.0.1:1", stderr: line => stderr.push(line) });

	log.error("will fail to export");
	const ret = log.end();

	t.ok(ret && typeof ret.then === "function", "end() returns a thenable");
	await ret;
	t.ok(stderr.join("\n").includes("127.0.0.1:1"), "the export error, incl. the endpoint url, is written to stderr");
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

test("OTLP/JSON exports one log record and one span sharing trace/span ids", async t => {
	const { calls } = stubFetch();
	const log = new Log({
		context: { "service.name": "eva-bosse" },
		otlpHttpBaseURI: "http://127.0.0.1:4318",
		spanName: "lur-bert",
		stderr: () => {},
	});

	log.warn("FOo", { active: true, bar: "baz", "lökig knasnyckel | typ": 17 });
	await log.end();

	t.ok(calls.every(call => call.contentType === "application/json"), "default protocol sends JSON");

	const logsBody: any = calls.find(call => call.path === "/v1/logs")!.body;
	const tracesBody: any = calls.find(call => call.path === "/v1/traces")!.body;
	const resourceAttr = (attrs: any[], key: string) => attrs.find(attr => attr.key === key)?.value.stringValue;

	// Exactly one resource/scope/record and resource/scope/span.
	t.strictEqual(logsBody.resourceLogs.length, 1, "one resourceLog");
	t.strictEqual(logsBody.resourceLogs[0].scopeLogs.length, 1, "one scopeLog");
	t.strictEqual(logsBody.resourceLogs[0].scopeLogs[0].logRecords.length, 1, "one logRecord");
	t.strictEqual(tracesBody.resourceSpans.length, 1, "one resourceSpan");
	t.strictEqual(tracesBody.resourceSpans[0].scopeSpans.length, 1, "one scopeSpan");
	t.strictEqual(tracesBody.resourceSpans[0].scopeSpans[0].spans.length, 1, "one span");

	const logRecord = logsBody.resourceLogs[0].scopeLogs[0].logRecords[0];

	t.strictEqual(logRecord.body.stringValue, "FOo", "log body");
	t.strictEqual(logRecord.severityNumber, 13, "severityNumber is WARN (13)");
	t.strictEqual(logRecord.severityText, "WARN", "severityText is WARN");
	t.ok(isNanoTimestampWithinHour(logRecord.timeUnixNano), "log timeUnixNano is reasonable");
	t.deepEqual(
		logRecord.attributes,
		[
			{ key: "active", value: { stringValue: "true" } },
			{ key: "bar", value: { stringValue: "baz" } },
			{ key: "lökig knasnyckel | typ", value: { stringValue: "17" } },
		],
		"metadata attributes are coerced to strings, in insertion order",
	);

	// service.name lives on the resource (what Grafana/Loki reads), never duplicated on the record.
	t.strictEqual(resourceAttr(logsBody.resourceLogs[0].resource.attributes, "service.name"), "eva-bosse", "service.name on log resource");
	t.notOk(logRecord.attributes.find((attr: any) => attr.key === "service.name"), "service.name not duplicated on the record");

	const traceResource = tracesBody.resourceSpans[0];

	t.strictEqual(traceResource.resource.attributes.length, 4, "resource has 4 attributes");
	t.strictEqual(traceResource.resource.droppedAttributesCount, 0, "no dropped resource attributes");
	t.strictEqual(resourceAttr(traceResource.resource.attributes, "service.name"), "eva-bosse", "service.name on span resource");
	t.strictEqual(resourceAttr(traceResource.resource.attributes, "telemetry.sdk.language"), "ecmascript", "telemetry.sdk.language");
	t.strictEqual(resourceAttr(traceResource.resource.attributes, "telemetry.sdk.name"), "@larvit/log", "telemetry.sdk.name");
	t.ok(/^\d+\.\d+\.\d+/.test(resourceAttr(traceResource.resource.attributes, "telemetry.sdk.version")), "telemetry.sdk.version is a real semver (build replaced __version__)");

	const span = traceResource.scopeSpans[0].spans[0];

	t.strictEqual(traceResource.scopeSpans[0].scope.name, "lur-bert", "scope name is the span name");
	t.strictEqual(span.name, "lur-bert", "span name");
	t.strictEqual(span.kind, 1, "span kind 1");
	t.strictEqual(span.status.code, 0, "span status is ok");
	t.strictEqual(span.attributes.length, 0, "no span attributes (context held only service.name)");
	t.strictEqual(span.links.length, 0, "span has no links");
	t.strictEqual(span.droppedLinksCount, 0, "span has no dropped links");
	t.strictEqual(span.traceId, logRecord.traceId, "span and log share the traceId");
	t.strictEqual(span.spanId, logRecord.spanId, "span and log share the spanId");
	t.ok(isNanoTimestampWithinHour(span.startTimeUnixNano), "span startTimeUnixNano is reasonable");
	t.ok(isNanoTimestampWithinHour(span.endTimeUnixNano), "span endTimeUnixNano is reasonable");
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

test("OTLP instances export independently, each with its own service.name", async t => {
	const { calls } = stubFetch();
	const otlp = { otlpHttpBaseURI: "http://127.0.0.1:4318", stderr: () => {} };

	const log1 = new Log({ context: { "service.name": "log1" }, ...otlp });

	log1.warn("rappakalja");
	await log1.end();

	const log2 = new Log({ context: { "service.name": "log2" }, ...otlp });

	log2.warn("bollhav");
	await log2.end();

	t.strictEqual(calls.length, 4, "two log exports + two trace exports");

	const serviceFor = (msg: string) => {
		const call = calls.find(call => call.path === "/v1/logs" && call.body.resourceLogs[0].scopeLogs[0].logRecords[0].body.stringValue === msg)!;

		return call.body.resourceLogs[0].resource.attributes.find((attr: any) => attr.key === "service.name").value.stringValue;
	};

	t.strictEqual(serviceFor("rappakalja"), "log1", "first instance keeps its service.name");
	t.strictEqual(serviceFor("bollhav"), "log2", "second instance keeps its service.name");
	t.end();
});

// --- trace context propagation (W3C traceparent) ---------------------------

test("formatTraceparent/parseTraceparent round-trip", t => {
	const traceId = generateTraceId();
	const spanId = generateSpanId();
	const header = formatTraceparent(traceId, spanId);

	t.ok(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/.test(header), "formatted header has the W3C shape and is sampled");

	const parsed = parseTraceparent(header);

	t.strictEqual(parsed?.traceId, traceId, "round-tripped traceId");
	t.strictEqual(parsed?.spanId, spanId, "round-tripped spanId");
	t.end();
});

test("parseTraceparent rejects malformed headers", t => {
	t.strictEqual(parseTraceparent("garbage"), null, "non-hex garbage is rejected");
	t.strictEqual(parseTraceparent(`00-${"0".repeat(32)}-${"a".repeat(16)}-01`), null, "all-zero traceId is rejected");
	t.strictEqual(parseTraceparent(`00-${"a".repeat(32)}-${"0".repeat(16)}-01`), null, "all-zero spanId is rejected");
	t.strictEqual(parseTraceparent(`00-${"a".repeat(31)}-${"b".repeat(16)}-01`), null, "wrong-length traceId is rejected");
	t.end();
});

test("traceparent adoption: incoming joins; malformed, parentLog and clone do not", t => {
	const traceId = generateTraceId();
	const spanId = generateSpanId();

	// An incoming traceparent: join the trace and nest under its span.
	const adopted = new Log({ traceparent: formatTraceparent(traceId, spanId) });

	t.strictEqual(adopted.span.traceId, traceId, "adopts the incoming trace");
	t.strictEqual(adopted.span.parentSpanId, spanId, "nests under the incoming span");

	// Malformed (untrusted) input is ignored: a fresh trace starts, no throw.
	let fresh!: Log;

	t.doesNotThrow(() => { fresh = new Log({ traceparent: "not-a-traceparent" }); }, "malformed traceparent does not throw");
	t.notStrictEqual(fresh.span.traceId, traceId, "malformed traceparent starts a fresh trace");
	t.strictEqual(fresh.span.parentSpanId, undefined, "no parent span for a fresh trace");

	// An in-process parentLog wins over a supplied traceparent.
	const parent = new Log();
	const child = new Log({ parentLog: parent, traceparent: formatTraceparent(traceId, spanId) });

	t.strictEqual(child.span.traceId, parent.span.traceId, "parentLog trace wins over the header");
	t.strictEqual(child.span.parentSpanId, parent.span.spanId, "parentLog span is the parent");

	// A clone is its own trace, never re-adopting the base's traceparent.
	t.notStrictEqual(adopted.clone().span.traceId, adopted.span.traceId, "clone starts its own trace");
	t.end();
});

test("log.traceparent() emits the current span context", t => {
	const log = new Log();

	t.strictEqual(log.traceparent(), formatTraceparent(log.span.traceId, log.span.spanId), "emitted header carries this span's context");
	t.end();
});

// --- log.fetch() auto-instrumentation --------------------------------------

test("log.fetch traces a successful call and drops the query by default", async t => {
	const { calls } = stubFetch();
	const log = new Log({ context: { "service.name": "svc" }, otlpHttpBaseURI: "http://127.0.0.1:4318", stderr: () => {} });

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
	t.strictEqual(attr("http.response.status_code"), "200", "status_code attribute");
	t.end();
});

test("log.fetch captureQuery keeps the query but redacts known-sensitive keys", async t => {
	const { calls } = stubFetch();
	const log = new Log({ captureQuery: true, otlpHttpBaseURI: "http://127.0.0.1:4318", stderr: () => {} });

	await log.fetch("https://api.test/x?q=hi&Signature=abc");
	await log.end();

	const urlFull = clientSpan(calls).attributes.find((attribute: any) => attribute.key === "url.full").value.stringValue;

	t.ok(urlFull.includes("q=hi"), "non-sensitive query param is kept");
	t.ok(urlFull.includes("Signature=REDACTED"), "sensitive query value is redacted");
	t.ok(!urlFull.includes("abc"), "the sensitive value is not leaked");
	t.end();
});

test("log.fetch captures allow-listed request and response headers only", async t => {
	const { calls } = stubFetch(path => path === "/h" ? response({ headers: new Headers({ "x-resp": "rv", "x-secret": "nope" }) }) : undefined);
	const log = new Log({
		captureRequestHeaders: ["x-req"],
		captureResponseHeaders: ["x-resp"],
		otlpHttpBaseURI: "http://127.0.0.1:4318",
		stderr: () => {},
	});

	await log.fetch("https://api.test/h", { headers: { "x-other": "ignored", "x-req": "qv" } });
	await log.end();

	const span = clientSpan(calls);
	const attr = (key: string) => span.attributes.find((attribute: any) => attribute.key === key)?.value.stringValue;

	t.strictEqual(attr("http.request.header.x-req"), "qv", "allow-listed request header captured");
	t.strictEqual(attr("http.request.header.x-other"), undefined, "non-listed request header not captured");
	t.strictEqual(attr("http.response.header.x-resp"), "rv", "allow-listed response header captured");
	t.strictEqual(attr("http.response.header.x-secret"), undefined, "non-listed response header not captured");
	t.end();
});

test("log.fetch marks error spans for 4xx and for network failures, propagating each outcome", async t => {
	const { calls } = stubFetch(path => {
		if (path === "/missing") return response({ status: 404 });
		if (path === "/boom") throw Object.assign(new Error("down"), { code: "ECONNREFUSED" });

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

	await log.end();

	const spans = calls.filter(call => call.path === "/v1/traces").map(call => call.body.resourceSpans[0].scopeSpans[0].spans[0]);
	const attr = (span: any, key: string) => span.attributes.find((attribute: any) => attribute.key === key)?.value.stringValue;
	const span404 = spans.find(span => attr(span, "http.response.status_code") === "404")!;
	const spanBoom = spans.find(span => attr(span, "error.type") === "ECONNREFUSED")!;

	t.strictEqual(span404.status.code, 2, "the 4xx span is ERROR");
	t.strictEqual(spanBoom.status.code, 2, "the network-failure span is ERROR");
	t.strictEqual(attr(spanBoom, "error.type"), "ECONNREFUSED", "error.type captured from the error code");
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

test("await log.end() drains a fire-and-forget log.fetch span", async t => {
	const { calls } = stubFetch();
	const log = new Log({ otlpHttpBaseURI: "http://127.0.0.1:4318", stderr: () => {} });

	log.fetch("https://api.test/bg"); // deliberately NOT awaited

	await log.end();

	// The span must be delivered by the time end() resolves, else a short-lived process would exit first.
	t.strictEqual(clientSpan(calls).name, "GET api.test", "the client span was exported before end() resolved");
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
