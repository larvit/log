import { consoleTransport, Log, otlpTransport, Queue, type Transport, type TransportEntry, type TransportSpan } from "../index.js";
import { recordingFetch, thrown } from "./test-doubles.js";
import test from "./tap.js";

function spy() {
	const entries: TransportEntry[] = [];
	const spans: TransportSpan[] = [];
	let flushes = 0;
	const transport: Transport = {
		entry: entry => { entries.push(entry); },
		flush: () => {
			flushes++;

			return Promise.resolve();
		},
		span: span => { spans.push(span); },
	};

	return { entries, flushes: () => flushes, spans, transport };
}

function recorder() {
	const calls: Parameters<typeof recordingFetch>[0] = [];

	return { calls, fetch: recordingFetch(calls) };
}

test("a transport is handed each entry as a plain object, and the console is not written without consoleTransport", t => {
	const { entries, transport } = spy();
	const stdout: string[] = [];
	const log = new Log({ clock: { clearTimeout: () => {}, now: () => 1758150000000, setTimeout: () => 0 }, context: { app: "a" }, spanName: "job", transports: [transport, consoleTransport({ stdout: line => { stdout.push(line); } })] });

	log.info("hello", { user: 7 });
	log.debug("below the level");
	t.deepEqual(entries, [{
		logLevel: "info",
		metadata: { app: "a", user: 7 },
		msTimestamp: 1758150000000,
		msg: "hello",
		spanId: log.span.spanId,
		spanName: "job",
		traceId: log.span.traceId,
	}], "one plain entry, context merged, for the call at or above logLevel");
	t.strictEqual(stdout.length, 1, "the console transport in the list is written too");
	t.strictEqual(log.conf.transports?.length, 2, "log.conf.transports reads the list back");
	t.strictEqual(new Log().conf.transports, undefined, "unset on a Log that uses the default list");
	t.end();
});

test("a transport skips a kind by leaving its method out, and end() hands span() the span and flushes", async t => {
	const { flushes, spans, transport } = spy();
	const log = new Log({ context: { app: "a" }, transports: [{}, transport] });

	log.info("no method takes this in the first transport");
	await log.end();
	t.strictEqual(spans.length, 1, "one span");
	t.strictEqual(spans[0].span, log.span, "the Log's own span");
	t.deepEqual(spans[0].attributes, { app: "a" }, "with the context as its attributes");
	t.strictEqual(flushes(), 1, "end() flushes each transport that has flush");

	const empty = new Log({ transports: [] });

	empty.error("goes nowhere");
	await empty.end();
	t.end();
});

test("consoleTransport takes the console options: format, colors, printTraceInfo, stdout and stderr", t => {
	const stderr: string[] = [];
	const stdout: string[] = [];
	const log = new Log({ transports: [consoleTransport({ format: "json", printTraceInfo: true, stderr: line => { stderr.push(line); }, stdout: line => { stdout.push(line); } })] });

	log.info("out");
	log.warn("err");
	t.strictEqual(JSON.parse(stdout[0]).msg, "out", "info goes to stdout as JSON");
	t.strictEqual(JSON.parse(stdout[0]).traceId, log.span.traceId, "printTraceInfo adds the trace id");
	t.strictEqual(JSON.parse(stderr[0]).msg, "err", "warn goes to stderr");

	const plain: string[] = [];
	const text = new Log({ transports: [consoleTransport({ colors: false, format: entry => `${entry.colors}|${entry.msg}`, stdout: line => { plain.push(line); } })] });

	text.info("x");
	t.deepEqual(plain, ["false|x"], "a function format is handed the entry and the transport's colors");
	t.end();
});

test("otlpTransport sends entries and spans under baseUrl with its own fetch, headers and protocol", async t => {
	const { calls, fetch } = recorder();
	const globalFetch = globalThis.fetch;
	let globalCalls = 0;

	globalThis.fetch = () => {
		globalCalls++;

		return Promise.reject(new Error("the global fetch"));
	};

	const log = new Log({ transports: [otlpTransport({ baseUrl: "https://collector.example.com/base", fetch, headers: { Authorization: "Bearer t" } })] });

	log.info("hello");
	await log.end();
	globalThis.fetch = globalFetch;
	t.deepEqual(calls.map(call => call.url).sort(), ["https://collector.example.com/base/v1/logs", "https://collector.example.com/base/v1/traces"], "logs and traces under baseUrl");
	t.strictEqual(new Headers(calls[0].headers).get("Authorization"), "Bearer t", "headers are sent");
	t.strictEqual(calls.find(call => call.path.endsWith("/v1/logs"))?.body.resourceLogs[0].scopeLogs[0].logRecords[0].traceId, log.span.traceId, "the record carries the entry's trace id");
	t.strictEqual(globalCalls, 0, "the global fetch is never called");

	const proto = recorder();
	const protoLog = new Log({ transports: [otlpTransport({ baseUrl: "https://collector.example.com", fetch: proto.fetch, protocol: "http/protobuf" })] });

	protoLog.info("hello");
	await protoLog.flush();
	t.strictEqual(proto.calls[0].contentType, "application/x-protobuf", "protocol picks the wire format");
	t.end();
});

test("a Queue sends with the fetch it is given", async t => {
	const { calls, fetch } = recorder();
	const log = new Log({ otlpQueue: new Queue({ fetch, otlpHttpBaseURI: "https://collector.example.com" }), stdout: () => {} });

	log.info("hello");
	await log.flush();
	t.strictEqual(calls.length, 1, "one POST through the injected fetch");
	t.end();
});

test("transports beside an option it replaces throws, naming where the option goes", t => {
	const transports = [consoleTransport()];

	t.strictEqual(thrown(() => new Log({ format: "json", transports })), "Error: format belongs to consoleTransport({ format }) once transports is set", "format");
	t.strictEqual(thrown(() => new Log({ entryFormatter: () => "", transports })), "Error: entryFormatter belongs to consoleTransport({ format }) once transports is set", "entryFormatter");
	t.strictEqual(thrown(() => new Log({ colors: false, transports })), "Error: colors belongs to consoleTransport({ colors }) once transports is set", "colors");
	t.strictEqual(thrown(() => new Log({ printTraceInfo: true, transports })), "Error: printTraceInfo belongs to consoleTransport({ printTraceInfo }) once transports is set", "printTraceInfo");
	t.strictEqual(thrown(() => new Log({ stdout: () => {}, transports })), "Error: stdout belongs to consoleTransport({ stdout }) once transports is set", "stdout");
	t.strictEqual(thrown(() => new Log({ otlpHttpBaseURI: "https://a.example.com", transports })), "Error: otlpHttpBaseURI belongs to otlpTransport({ baseUrl }) once transports is set", "otlpHttpBaseURI");
	t.strictEqual(thrown(() => new Log({ otlpAdditionalHeaders: {}, transports })), "Error: otlpAdditionalHeaders belongs to otlpTransport({ headers }) once transports is set", "otlpAdditionalHeaders");
	t.strictEqual(thrown(() => new Log({ otlpProtocol: "http/json", transports })), "Error: otlpProtocol belongs to otlpTransport({ protocol }) once transports is set", "otlpProtocol");
	t.strictEqual(thrown(() => new Log({ otlpQueue: { enqueue: () => {}, flush: () => Promise.resolve() }, transports })), "Error: otlpQueue is replaced by otlpTransport() once transports is set", "otlpQueue");
	t.end();
});

test("a child and a clone inherit the list, their own list replaces it, and stderr stays beside it", async t => {
	const parentSpy = spy();
	const stderr: string[] = [];
	const parent = new Log({ stderr: line => { stderr.push(line); }, transports: [parentSpy.transport] });
	const child = new Log({ parentLog: parent });
	const clone = parent.clone({ logLevel: "debug" });

	child.info("from the child");
	clone.debug("from the clone");
	t.deepEqual(parentSpy.entries.map(entry => entry.msg), ["from the child", "from the clone"], "both inherit the parent's list");
	t.strictEqual(parentSpy.entries[0].spanId, parent.span.spanId, "a child's entry carries the span it is exported under, its parent's");
	t.strictEqual(child.conf.transports, parent.conf.transports, "the child's conf reads the same list");

	const own = spy();
	const replaced = new Log({ parentLog: parent, transports: [own.transport] });

	replaced.info("only mine");
	t.strictEqual(parentSpy.entries.length, 2, "a child's own list replaces its parent's");
	t.strictEqual(own.entries.length, 1, "and takes the entry");

	const added = new Log({ parentLog: parent, transports: [...parent.conf.transports ?? [], own.transport] });

	added.info("both");
	t.strictEqual(parentSpy.entries.length + own.entries.length, 5, "spreading the parent's list adds to it");
	t.strictEqual(thrown(() => new Log({ format: "json", parentLog: parent })), "Error: format belongs to consoleTransport({ format }) once transports is set", "a replaced option under an inherited list throws too");
	t.strictEqual(new Log(parent.conf).conf.transports, parent.conf.transports, "a Log's own conf is accepted as options");
	t.strictEqual(new Log({ ...parent.conf }).conf.transports, parent.conf.transports, "and so is a spread of it");
	t.strictEqual(stderr.length, 0, "no warning was written");
	await parent.flush();
	t.end();
});

test("a child with its own list takes no console or otlp option from a parent that has none", async t => {
	const { calls, fetch } = recorder();
	const stdout: string[] = [];
	const parent = new Log({ format: "json", otlpQueue: new Queue({ fetch, otlpHttpBaseURI: "https://collector.example.com" }), stdout: line => { stdout.push(line); } });
	const own = spy();
	const child = new Log({ parentLog: parent, transports: [own.transport] });

	child.info("only the list");
	await child.flush();
	t.strictEqual(own.entries.length, 1, "the list takes the entry");
	t.strictEqual(stdout.length, 0, "the parent's stdout does not");
	t.strictEqual(calls.length, 0, "and neither does the parent's queue");
	t.strictEqual(child.conf.otlpQueue, undefined, "the child's conf holds no queue");
	t.end();
});

test("consoleTransport writes text unless told otherwise, error to stderr, and keeps the metadata beside the trace info", t => {
	const stderr: string[] = [];
	const stdout: string[] = [];
	const log = new Log({ transports: [consoleTransport({ colors: false, format: "text", printTraceInfo: true, stderr: line => { stderr.push(line); }, stdout: line => { stdout.push(line); } })] });

	log.info("out", { orderId: "o1" });
	log.error("bad");
	t.ok(stdout[0].includes("[inf] out {\"orderId\":\"o1\",\"spanId\":"), `format "text" writes the text line with the metadata first, got ${stdout[0]}`);
	t.strictEqual(stdout.length, 1, "error is not written to stdout");
	t.ok(stderr[0].includes("[err] bad"), "error goes to stderr");
	t.end();
});

test("a clone's console options win over the list of the parentLog it is given", t => {
	const stdout: string[] = [];
	const original = new Log({ format: "json", stdout: line => { stdout.push(line); } });
	const listed = spy();
	const parent = new Log({ transports: [listed.transport] });
	const clone = original.clone({ parentLog: parent });

	clone.info("to the console");
	t.strictEqual(JSON.parse(stdout[0]).msg, "to the console", "the clone writes as the Log it clones");
	t.strictEqual(listed.entries.length, 0, "and takes no list from the parent");
	t.strictEqual(clone.conf.transports, undefined, "its conf holds none");
	t.end();
});

test("consoleTransport defaults its colors as a Log does", t => {
	const lines: string[] = [];
	const log = new Log({ transports: [consoleTransport({ format: entry => String(entry.colors), stdout: line => { lines.push(line); } })] });

	log.info("x");
	t.deepEqual(lines, [String(new Log().conf.colors)], "the environment's choice, or else on");
	t.end();
});
