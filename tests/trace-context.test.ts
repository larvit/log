import { formatTraceparent, generateSpanId, generateTraceId, Log, type LogInt, type Metadata, type OtlpSpan, parseTraceparent, Queue } from "../index.js";
import { pbDecode, pbMsg } from "./protobuf-decode.js";
import test from "./tap.js";
import { callHeader, exportedRecords, exportedSpans, stubFetch } from "./test-doubles.js";

test("spans of different names share one scopeSpans entry in a POST", async t => {
	const { calls } = stubFetch();
	const log = new Log({ otlpHttpBaseURI: "http://127.0.0.1:4318", spanName: "parent", stderr: () => {} });

	void new Log({ parentLog: log, spanName: "child" }).end();
	await log.end();

	const scopeSpans = calls.filter(call => call.path === "/v1/traces").flatMap(call => call.body.resourceSpans.flatMap((resourceSpan: any) => resourceSpan.scopeSpans));

	t.deepEqual(scopeSpans.map(scopeSpan => scopeSpan.spans.map((span: any) => span.name)), [["child", "parent"]], "both spans under the one scope");
	t.end();
});

test("a batch merges per scope, keeping a v2.4.0 stored payload's apart", async t => {
	const { calls } = stubFetch();
	const queue = new Queue({ otlpHttpBaseURI: "http://127.0.0.1:4318" });
	const resource = { attributes: [{ key: "service.name", value: { stringValue: "svc" } }] };
	const record = (msg: string) => ({ body: { stringValue: msg }, severityNumber: 9, severityText: "INFO", timeUnixNano: "1" });
	const span = (name: string): OtlpSpan => ({ attributes: [], droppedAttributesCount: 0, droppedEventsCount: 0, droppedLinksCount: 0, endTimeUnixNano: "2", events: [], kind: 1, links: [], name, spanId: generateSpanId(), startTimeUnixNano: "1", status: { code: 0 }, traceId: generateTraceId() });
	const scope = { name: "@larvit/log", version: "2.5.0" };

	for (const [msg, logScope] of [["new", scope], ["stored", undefined], ["new too", scope]] as const) {
		queue.enqueue({ resourceLogs: [{ resource, scopeLogs: [{ logRecords: [record(msg)], ...logScope ? { scope: logScope } : {} }] }] });
	}

	for (const [name, spanScope] of [["new", scope], ["stored", { name: "stored" }], ["new too", scope]] as const) {
		queue.enqueue({ resourceSpans: [{ resource: { ...resource, droppedAttributesCount: 0 }, scopeSpans: [{ scope: spanScope, spans: [span(name)] }] }] });
	}

	await queue.flush();

	const logs = calls.find(call => call.path === "/v1/logs")!.body.resourceLogs;
	const traces = calls.find(call => call.path === "/v1/traces")!.body.resourceSpans;

	t.deepEqual(logs.map((entry: any) => entry.scopeLogs.map((scopeLog: any) => [scopeLog.scope?.name, scopeLog.logRecords.map((rec: any) => rec.body.stringValue)])), [[["@larvit/log", ["new", "new too"]], [undefined, ["stored"]]]], "records group under one resource, per scope");
	t.deepEqual(traces.map((entry: any) => entry.scopeSpans.map((scopeSpan: any) => [scopeSpan.scope.name, scopeSpan.spans.map((item: any) => item.name)])), [[["@larvit/log", ["new", "new too"]], ["stored", ["stored"]]]], "and so do spans");

	const protobuf = new Queue({ otlpHttpBaseURI: "http://127.0.0.1:4318", otlpProtocol: "http/protobuf" });

	calls.length = 0;
	protobuf.enqueue({ resourceLogs: [{ resource, scopeLogs: [{ logRecords: [record("stored")] }] }] });
	await protobuf.flush();
	t.strictEqual(pbMsg(pbMsg(pbDecode(calls[0].rawBody).get(1)![0]).get(2)![0]).get(1), undefined, "a scopeless stored record goes out with no scope on the wire, as v2.4.0 sent it");
	t.end();
});

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
	t.strictEqual(parseTraceparent(`ff-${"a".repeat(32)}-${"b".repeat(16)}-01`), null, "version ff is rejected");
	t.end();
});

test("parseTraceparent reads the sampled flag", t => {
	const ids = `${generateTraceId()}-${generateSpanId()}`;

	t.strictEqual(parseTraceparent(`00-${ids}-01`)?.sampled, true, "01 is sampled");
	t.strictEqual(parseTraceparent(`00-${ids}-00`)?.sampled, false, "00 is unsampled");
	t.strictEqual(parseTraceparent(`00-${ids}-03`)?.sampled, true, "only the lowest bit decides");
	t.strictEqual(parseTraceparent(`00-${ids}-02`)?.sampled, false, "a higher bit alone is unsampled");
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

	const noop = () => {};
	const v230Level = (msg: string, metadata?: Metadata) => Object.values(metadata ?? {}).map(value => value.toString());
	const v230Parent: LogInt = { conf: {}, debug: noop, end: async () => {}, error: v230Level, fetch: async () => new Response(), info: noop, silly: noop, span: parent.span, traceparent: () => "", verbose: noop, warn: v230Level };
	const forwarded: Metadata = { key: "value" };
	const v230Child = new Log({ parentLog: v230Parent });

	t.strictEqual(v230Child.span.parentSpanId, parent.span.spanId, "a parentLog written against v2.3.0 is nested under");
	t.strictEqual(v230Child.sampled, true, "and its missing sampled reads as sampled");
	v230Parent.info("forwarded", forwarded);

	// A clone is its own trace, never re-adopting the base's traceparent.
	t.notStrictEqual(adopted.clone().span.traceId, adopted.span.traceId, "clone starts its own trace");
	t.strictEqual(adopted.conf.traceparent, formatTraceparent(traceId, spanId), "the instance given it reads it back");
	t.strictEqual(new Log({ parentLog: adopted }).conf.traceparent, undefined, "a child does not inherit it");
	t.end();
});

test("log.traceparent() emits the current span context", t => {
	const log = new Log();

	t.strictEqual(log.traceparent(), formatTraceparent(log.span.traceId, log.span.spanId), "emitted header carries this span's context");
	t.strictEqual(log.sampled, true, "a fresh trace is sampled");
	t.end();
});

test("an unsampled traceparent exports records but no spans, passes 00 on and still prints", async t => {
	const { calls } = stubFetch();
	const stdout: string[] = [];
	const traceparent = formatTraceparent(generateTraceId(), generateSpanId(), false);
	const log = new Log({ otlpHttpBaseURI: "http://127.0.0.1:4318", stderr: () => {}, stdout: line => { stdout.push(line); }, traceparent });
	const child = new Log({ parentLog: log, spanName: "child" });
	const clone = log.clone({ spanName: "clone" });

	t.strictEqual(log.sampled, false, "the incoming flag is honoured");
	t.strictEqual(child.sampled, false, "a child inherits the flag");
	t.strictEqual(clone.sampled, true, "a clone is its own, sampled, trace");
	t.ok(log.traceparent().endsWith("-00"), "the outgoing header says unsampled");
	t.ok(child.traceparent().endsWith("-00"), "a child's outgoing header says unsampled");
	t.ok(clone.traceparent().endsWith("-01"), "a clone's outgoing header says sampled");

	log.info("kept on the console");
	child.info("child record");
	await log.fetch("https://api.test/x");
	await child.end();
	await log.end();

	t.ok(callHeader(calls.find(call => call.path === "/x")!, "traceparent")?.endsWith("-00"), "log.fetch propagates the unsampled flag");
	t.strictEqual(exportedRecords(calls).join(","), "kept on the console,child record", "records export whatever the flag says");
	t.strictEqual(exportedSpans(calls).length, 0, "no span reaches the collector");
	t.strictEqual(stdout.length, 2, "console output is unaffected");

	clone.info("clone record");
	await clone.end();

	t.ok(exportedRecords(calls).includes("clone record"), "the clone's record exports");
	t.strictEqual(exportedSpans(calls).map(span => span.name).join(","), "clone", "only the clone's span exports");
	t.end();
});
