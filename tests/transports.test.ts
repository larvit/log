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

test("a transport is handed each entry as a plain object", t => {
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
	const text = new Log({ transports: [consoleTransport({ colors: false, format: entry => `${entry.colors}|${entry.msg}|${JSON.stringify(entry.metadata)}`, stdout: line => { plain.push(line); } })] });

	text.info("x", { orderId: "o1" });
	t.deepEqual(plain, ["false|x|{\"orderId\":\"o1\"}"], "a function format is handed the entry, its metadata and the transport's colors");
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

	t.strictEqual(thrown(() => new Log({ format: "json", transports })), "Error: format belongs to consoleTransport({ format }), since this Log has transports", "format");
	t.strictEqual(thrown(() => new Log({ entryFormatter: () => "", transports })), "Error: entryFormatter belongs to consoleTransport({ format }), since this Log has transports", "entryFormatter");
	t.strictEqual(thrown(() => new Log({ colors: false, transports })), "Error: colors belongs to consoleTransport({ colors }), since this Log has transports", "colors");
	t.strictEqual(thrown(() => new Log({ printTraceInfo: true, transports })), "Error: printTraceInfo belongs to consoleTransport({ printTraceInfo }), since this Log has transports", "printTraceInfo");
	t.strictEqual(thrown(() => new Log({ stdout: () => {}, transports })), "Error: stdout belongs to consoleTransport({ stdout }), since this Log has transports", "stdout");
	t.strictEqual(thrown(() => new Log({ otlpHttpBaseURI: "https://a.example.com", transports })), "Error: otlpHttpBaseURI belongs to otlpTransport({ baseUrl }), since this Log has transports", "otlpHttpBaseURI");
	t.strictEqual(thrown(() => new Log({ otlpAdditionalHeaders: {}, transports })), "Error: otlpAdditionalHeaders belongs to otlpTransport({ headers }), since this Log has transports", "otlpAdditionalHeaders");
	t.strictEqual(thrown(() => new Log({ otlpProtocol: "http/json", transports })), "Error: otlpProtocol belongs to otlpTransport({ protocol }), since this Log has transports", "otlpProtocol");
	t.strictEqual(thrown(() => new Log({ otlpQueue: { enqueue: () => {}, flush: () => Promise.resolve() }, transports })), "Error: otlpQueue is replaced by otlpTransport({ baseUrl }) or a transport of your own, since this Log has transports", "otlpQueue");
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
	t.strictEqual(thrown(() => new Log({ format: "json", parentLog: parent })), "Error: format belongs to consoleTransport({ format }), since this Log inherits transports", "a replaced option under an inherited list throws too");
	t.strictEqual(new Log(parent.conf).conf.transports, parent.conf.transports, "a Log's own conf is accepted as options");
	t.strictEqual(new Log({ ...parent.conf }).conf.transports, parent.conf.transports, "and so is a spread of it");
	t.strictEqual(stderr.length, 0, "no warning was written");
	await parent.flush();
	t.end();
});

test("a child with its own list takes no console or otlp option from a parent without a list", async t => {
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

test("consoleTransport follows the process env for colors unset in code, defaulting to on; set in code it ignores the env", t => {
	const original: unknown = Reflect.get(globalThis, "process");
	const env: Record<string, string> = { NO_COLOR: "1" };
	const lines: string[] = [];
	const logWith = (colors?: boolean) => new Log({ transports: [consoleTransport({ ...colors === undefined ? {} : { colors }, format: entry => String(entry.colors), stdout: line => { lines.push(line); } })] });

	Reflect.set(globalThis, "process", { env });
	try {
		logWith().info("NO_COLOR in the process env turns it off");
		logWith(true).info("colors: true in code wins over NO_COLOR");
		delete env.NO_COLOR;
		logWith().info("on when the env says nothing");
		env.FORCE_COLOR = "1";
		logWith(false).info("colors: false in code wins over FORCE_COLOR");
	} finally {
		if (original === undefined) {
			Reflect.deleteProperty(globalThis, "process");
		} else {
			Reflect.set(globalThis, "process", original);
		}
	}

	t.deepEqual(lines, ["false", "true", "true", "false"]);
	t.end();
});

test("a formatter that changes its entry's metadata changes no other transport's", async t => {
	const leak = (entry: { metadata?: Record<string, unknown> }) => {
		if (entry.metadata) entry.metadata.leaked = "yes";

		return "";
	};
	const listed = spy();
	const log = new Log({ transports: [consoleTransport({ format: leak, stdout: () => {} }), listed.transport] });

	log.info("listed", { orderId: "o1" });
	t.deepEqual(listed.entries[0].metadata, { orderId: "o1" }, "the transport after consoleTransport is handed what was logged");

	const payloads: unknown[] = [];
	const plain = new Log({ format: leak, otlpQueue: { enqueue: payload => { payloads.push(payload); }, flush: () => Promise.resolve() }, stdout: () => {} });

	plain.info("default list", { orderId: "o1" });
	await plain.flush();
	t.strictEqual(JSON.stringify(payloads).includes("leaked"), false, "and on a Log with no list the queue is handed what was logged");
	t.end();
});

test("a transport whose flush rejects, rejects flush() once the other transports have flushed", async t => {
	let delivered = false;
	const log = new Log({
		transports: [
			{ flush: () => Promise.reject(new Error("sentry is down")) },
			{
				flush: async () => {
					await Promise.resolve();
					await Promise.resolve();
					delivered = true;

					return true;
				},
			},
		],
	});
	const outcome = await log.flush().then(() => "resolved", (err: unknown) => String(err));

	t.strictEqual(outcome, "Error: sentry is down", "flush() rejects with what the transport rejected with");
	t.strictEqual(delivered, true, "after a flush that resolves with a value was awaited");
	t.end();
});

test("transports that is not a list of transport objects throws, saying what it takes", t => {
	const expected = "Error: transports takes a list of transports, such as [consoleTransport()]";

	t.strictEqual(thrown(() => new Log({ transports: Object(consoleTransport()) as [] })), expected, "a bare transport");
	t.strictEqual(thrown(() => new Log({ transports: [Object(consoleTransport) as object] })), expected, "a factory that was not called");
	t.strictEqual(thrown(() => new Log({ transports: [Object(null) as object, JSON.parse("null") as object] })), expected, "a null in the list");
	t.end();
});

test("an option beside an inherited list throws, saying the list is inherited", t => {
	const parent = new Log({ transports: [] });

	t.strictEqual(thrown(() => new Log({ format: "json", parentLog: parent })), "Error: format belongs to consoleTransport({ format }), since this Log inherits transports", "from a parentLog");
	t.strictEqual(thrown(() => parent.clone({ stdout: () => {} })), "Error: stdout belongs to consoleTransport({ stdout }), since this Log inherits transports", "from the Log it clones");
	t.end();
});

test("otlpTransport names its own options in what it throws and reports", async t => {
	const reports: string[] = [];

	t.strictEqual(thrown(() => otlpTransport({ baseUrl: "collector.example.com" })), "Error: baseUrl is not a valid URI; it needs an http:// or https:// prefix, and any / ? # \\ in a password percent-encoded", "a baseUrl without a scheme");
	otlpTransport({ baseUrl: "https://user:pass@collector.example.com", headers: { Authorization: "Bearer t" }, report: line => { reports.push(line); } });
	t.strictEqual(reports.length, 1, "both credential spellings warn once");
	t.ok(reports[0].startsWith("@larvit/log: baseUrl carries user:pass@ and headers sets Authorization, so the headers one is sent"), `in the transport's names, got ${reports[0]}`);
	t.strictEqual(reports[0].includes("otlp"), false, "and none of the queue's");

	const plain: string[] = [];
	const transport = otlpTransport({ baseUrl: "http://collector.example.com", fetch: () => Promise.resolve(new Response(null, { status: 200 })), headers: { Authorization: "Bearer t" }, report: line => { plain.push(line); } });

	transport.entry?.({ logLevel: "info", metadata: {}, msTimestamp: 0, msg: "x", spanId: "", spanName: "", traceId: "" });
	await transport.flush?.();
	t.ok(plain.some(line => line.endsWith("set acceptPlainHttpCredentials: true on otlpTransport")), `the plain-http warning says where to accept it, got ${plain.join(" | ")}`);
	t.end();
});

test("two otlpTransports sharing a report write the plain-http credential warning once", async t => {
	const reports: string[] = [];
	const report = (line: string): void => { reports.push(line); };

	for (let i = 0; i < 2; i++) {
		const transport = otlpTransport({ baseUrl: "http://shared-report.example.com", fetch: () => Promise.resolve(new Response(null, { status: 200 })), headers: { Authorization: "Bearer t" }, report });

		transport.entry?.({ logLevel: "info", metadata: {}, msTimestamp: 0, msg: "x", spanId: "", spanName: "", traceId: "" });
		await transport.flush?.();
	}

	t.strictEqual(reports.length, 1, `one line for both transports, got ${reports.join(" | ")}`);
	t.ok(reports[0]?.endsWith("set acceptPlainHttpCredentials: true on otlpTransport"), "in the transport's names");
	t.end();
});
