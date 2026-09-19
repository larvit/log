import { type DefinedMetadata, type EntryFormatterConf, formatTraceparent, generateSpanId, generateTraceId, Log, type LogConf, type Logger, type LogLevel, LogLevels, msgJsonFormatter, msgTextFormatter, type OtlpPayload, type OtlpQueue, parseTraceparent, Queue, type QueueStorage, type TimerHandle } from "./index.js";
import test from "./tap.js";

// --- helpers ---------------------------------------------------------------

// Polls until `done` holds; a hung condition fails through the harness timeout.
async function waitFor(done: () => boolean): Promise<void> {
	while (!done()) {
		await new Promise(resolve => setTimeout(resolve, 5));
	}
}

// The message of what `construct` throws, or "" when it does not.
function thrown(construct: () => void): string {
	try {
		construct();

		return "";
	} catch (err) {
		return String(err);
	}
}

// A queue's report sink, flattened to one object per line for deepEqual.
function reportSink() {
	const lines: DefinedMetadata[] = [];

	return { lines, report: (msg: string, metadata: DefinedMetadata) => { lines.push({ msg, ...metadata }); } };
}

// In-memory QueueStorage. `async` mimics AsyncStorage (promises); sync mimics localStorage.
function fakeStorage(async: boolean): QueueStorage & { data: Map<string, string> } {
	const data = new Map<string, string>();
	const maybe = <T>(value: T): T | Promise<T> => async ? Promise.resolve(value) : value;

	return {
		data,
		getItem: key => maybe(data.get(key) ?? null),
		removeItem: key => {
			data.delete(key);

			return maybe(undefined);
		},
		setItem: (key, value) => {
			data.set(key, value);

			return maybe(undefined);
		},
	};
}

// The OTLP nanosecond spelling of a millisecond instant; ns overflows Number, so build the string.
const nanos = (msTimestamp: number) => `${msTimestamp}000000`;

// A Clock the test drives: `now` moves only in advance(), which fires every timer that comes due.
function fakeClock(startMs = 1758150000000) {
	const timers = new Map<number, { callback: () => void, dueAt: number }>();
	let now = startMs;
	let nextTimer = 1;

	// One macrotask tick, which drains the queue's awaited work: it is promises all the way down.
	const settle = () => new Promise(resolve => setTimeout(resolve, 0));

	return {
		advance: async (deltaMs: number) => {
			const until = now + deltaMs;

			for (;;) {
				const due = [...timers].filter(([, timer]) => timer.dueAt <= until).sort((left, right) => left[1].dueAt - right[1].dueAt)[0];

				if (!due) break;

				timers.delete(due[0]);
				now = due[1].dueAt;
				due[1].callback();
				await settle();
			}

			now = until;
			await settle();
		},
		clearTimeout: (timer?: TimerHandle) => { timers.delete(Number(timer)); },
		now: () => now,
		pending: timers,
		setTimeout: (callback: () => void, delayMs: number) => {
			const timer = nextTimer++;

			timers.set(timer, { callback, dueAt: now + delayMs });

			return timer;
		},
		settle,
	};
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
	const calls: { body: any, contentType: string | null, headers: any, keepalive: unknown, path: string, rawBody: any, url: string }[] = [];

	globalThis.fetch = (async (url: string, init: { body?: any, headers?: HeadersInit, keepalive?: boolean } = {}) => {
		const contentType = new Headers(init.headers ?? {}).get("Content-Type");
		const path = new URL(String(url)).pathname;
		// Only JSON bodies are parsed; protobuf bodies are raw bytes, inspected via rawBody.
		const body = init.body !== undefined && contentType === "application/json" ? JSON.parse(init.body) : undefined;

		calls.push({ body, contentType, headers: init.headers, keepalive: init.keepalive, path, rawBody: init.body, url: String(url) });

		return responder?.(path, body) ?? response();
	}) as unknown as typeof fetch;

	return { calls };
}

// Read a header from a recorded call, normalising plain-object and Headers shapes.
const callHeader = (call: { headers: any }, name: string) => new Headers(call.headers ?? {}).get(name);

// Every span in every /v1/traces call, in export order, across all resource and scope groups.
function exportedSpans(calls: { body: any, path: string }[]): any[] {
	return calls.filter(call => call.path === "/v1/traces").flatMap(call => call.body.resourceSpans.flatMap((resourceSpan: any) => resourceSpan.scopeSpans.flatMap((scopeSpan: any) => scopeSpan.spans)));
}

// Log record bodies in every /v1/logs call, in export order, across all resource and scope groups.
function exportedRecords(calls: { body: any, path: string }[]): string[] {
	return calls.filter(call => call.path === "/v1/logs").flatMap(call => call.body.resourceLogs.flatMap((resourceLog: any) => resourceLog.scopeLogs.flatMap((scopeLog: any) => scopeLog.logRecords.map((rec: any) => rec.body.stringValue))));
}

// The exported CLIENT span (kind 3) — the one log.fetch creates.
function clientSpan(calls: { body: any, path: string }[]) {
	const span = exportedSpans(calls).find(span => span.kind === 3);

	if (!span) {
		throw new Error("no client span was exported");
	}

	return span;
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
			statusMessage: span.get(15) && pbMsg(span.get(15)![0]).get(2) ? pbStr(pbMsg(span.get(15)![0]).get(2)![0]) : undefined,
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
		const cap = capture({ colors: true, logLevel: "silly" }); // silly passes every level through the filter

		cap.log[level]("msg");
		t.strictEqual(cap[stream][0]?.substring(19), `Z [${token}] msg`, `${level} -> ${stream} with its token`);
	}

	const plain = capture({ colors: false });

	plain.log.info("msg");
	t.strictEqual(plain.stdout[0]?.substring(19), "Z [inf] msg", "colors: false writes the bare tag");
	t.ok(msgTextFormatter({ logLevel: "info", msg: "msg" }).includes("\x1b[1;32minf\x1b[0m"), "msgTextFormatter colours unless colors is false");
	t.end();
});

test("colors unset in code follows NO_COLOR and FORCE_COLOR; set in code it ignores them", t => {
	const original: unknown = Reflect.get(globalThis, "process");
	const setProcess = (value: unknown) => value === undefined ? Reflect.deleteProperty(globalThis, "process") : Reflect.set(globalThis, "process", value);
	const colorsWith = (env: Record<string, string> | undefined, conf?: LogConf) => {
		setProcess(env && { env });
		try {
			return new Log(conf).conf.colors;
		} finally {
			setProcess(original);
		}
	};

	t.strictEqual(colorsWith({}), true, "on by default");
	t.strictEqual(colorsWith(undefined), true, "on without a process global (browsers)");
	t.strictEqual(colorsWith({ NO_COLOR: "1" }), false, "NO_COLOR turns it off");
	t.strictEqual(colorsWith({ NO_COLOR: "" }), true, "an empty NO_COLOR does not count");
	t.strictEqual(colorsWith({ FORCE_COLOR: "1" }), true, "FORCE_COLOR turns it on");
	t.strictEqual(colorsWith({ FORCE_COLOR: "" }), true, "an empty FORCE_COLOR turns it on, as in Node");
	t.strictEqual(colorsWith({ FORCE_COLOR: "0" }), false, "FORCE_COLOR=0 turns it off");
	t.strictEqual(colorsWith({ FORCE_COLOR: "false" }), false, "FORCE_COLOR=false turns it off");
	t.strictEqual(colorsWith({ FORCE_COLOR: "1", NO_COLOR: "1" }), false, "NO_COLOR wins over FORCE_COLOR");
	t.strictEqual(colorsWith({ NO_COLOR: "1" }, { colors: true }), true, "colors: true in code wins over NO_COLOR");
	t.strictEqual(colorsWith({ FORCE_COLOR: "1" }, { colors: false }), false, "colors: false in code wins over FORCE_COLOR");
	t.end();
});

test("respects the configured log-level threshold", t => {
	const def = capture(); // default level is info

	def.log.info("x");
	def.log.verbose("x");
	def.log.debug("x");
	t.strictEqual(def.stdout.length, 1, "default level passes info but not verbose/debug");

	const logger: Logger = def.log;

	t.strictEqual(logger.enabled("info"), true, "enabled() is true at the threshold");
	t.strictEqual(logger.enabled("error"), true, "enabled() is true above the threshold");
	t.strictEqual(logger.enabled("verbose"), false, "enabled() is false below the threshold");

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
	t.strictEqual(none.log.enabled("error"), false, "enabled() is false for every level at none");
	t.end();
});

test("metadata and context appear in the output", t => {
	const meta = capture("info");

	meta.log.info("kattbajs", { foo: "bar", gone: undefined });
	t.strictEqual(meta.stdout[0].split(" kattbajs ")[1].trim(), "{\"foo\":\"bar\"}", "metadata is appended; undefined keys are dropped");

	const ctx = capture({ context: { bosse: "bäng", hasse: "luring", port: undefined } });

	ctx.log.info("kattbajs", { foo: "bar", port: 80 });
	t.strictEqual(
		ctx.stdout[0].split(" kattbajs ")[1].trim(),
		"{\"foo\":\"bar\",\"port\":80,\"bosse\":\"bäng\",\"hasse\":\"luring\"}",
		"metadata and context are merged into the output; an undefined context key does not shadow",
	);

	const seen: string[][] = [];
	const custom = capture({
		format: entry => {
			seen.push(Object.keys(entry.metadata ?? {}));

			return "";
		},
	});

	custom.log.info("x", { keep: 1, skip: undefined });
	t.deepEqual(seen, [["keep"]], "a custom formatter never sees undefined keys");
	t.end();
});

test("format takes a formatter function, inherited by clones and children", t => {
	const { log, stderr, stdout } = capture({ format: entry => `${entry.logLevel}|${entry.msg}` });

	log.info("hi");
	log.clone().info("cloned");
	new Log({ parentLog: log }).info("child");
	t.deepEqual(stdout, ["info|hi", "info|cloned", "info|child"], "the function formats the instance's output and is inherited");
	t.deepEqual(stderr, [], "the supported spelling warns about nothing");
	new Log({ format: "json", parentLog: log }).info("own");
	t.strictEqual(JSON.parse(stdout[3]).msg, "own", "a child's own format wins over the inherited one");

	const base = capture({ format: entry => entry.msg });

	base.log.clone({ format: "text" }).info("plain");
	t.ok(base.stdout[0].includes("inf") && base.stdout[0].endsWith(" plain"), "a clone switches a function format back to text");
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
	t.strictEqual(JSON.stringify(log.clone({ context: { foo: undefined } }).context), "{\"foo\":\"bar\"}", "an undefined override is dropped, not applied");
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
	const clock = fakeClock();
	const base = new Log({
		captureQuery: true,
		captureRequestHeaders: ["x-req"],
		captureResponseHeaders: ["x-resp"],
		clock,
		colors: false,
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
	t.strictEqual(child.conf.otlpQueue, base.conf.otlpQueue, "clone shares the base's queue, so both batch together");

	// log.fetch policy inherited.
	t.strictEqual(child.conf.captureQuery, true, "captureQuery inherited");
	t.deepEqual(child.conf.captureRequestHeaders, ["x-req"], "request header allow-list inherited");
	t.deepEqual(child.conf.captureResponseHeaders, ["x-resp"], "response header allow-list inherited");

	// printTraceInfo inherited.
	t.ok(stdout[0].includes("spanId"), "clone inherited printTraceInfo");

	t.strictEqual(child.conf.colors, false, "clone inherited colors");
	t.strictEqual(child.conf.clock, clock, "clone inherited the clock");

	const ownQueue = new Queue({ otlpHttpBaseURI: "http://127.0.0.1:4318" });
	const ownClock = ownQueue.conf.clock;

	new Log({ clock, otlpQueue: ownQueue });
	t.strictEqual(ownQueue.conf.clock, ownClock, "a queue the consumer built keeps its own clock, like its endpoint");
	t.strictEqual(new Log({ parentLog: base }).conf.colors, false, "a child inherits colors");
	t.strictEqual(new Log({ parentLog: base }).conf.clock, clock, "a child inherits the clock");

	// ...but the clone is its own span, not a child of base.
	t.notStrictEqual(child.span.traceId, base.span.traceId, "clone has its own traceId, not base's");
	t.end();
});

test("constructor throws on malformed otlpHttpBaseURI", t => {
	t.throws(() => new Log({ otlpHttpBaseURI: "not a valid uri" }), "malformed otlpHttpBaseURI throws at construction");
	// "otlp:" parses to an opaque path, which leaves the credentials sitting in pathname.
	t.throws(() => new Log({ otlpHttpBaseURI: "otlp:u:s3cr3t@127.0.0.1:4318" }), "a scheme other than http(s) throws at construction");

	for (const uri of ["http://u:s3cr3t/w@127.0.0.1:4318", "otlp:u:s3cr3t@127.0.0.1:4318"]) {
		let caught: unknown;

		try {
			new Log({ otlpHttpBaseURI: uri });
		} catch (err) {
			caught = err;
		}

		t.notOk(JSON.stringify(caught, Object.getOwnPropertyNames(caught as object)).includes("s3cr3t"), `the error thrown for ${uri.slice(0, 5)} carries no part of the URI, cause and input included`);
	}
	t.doesNotThrow(() => new Log({ otlpHttpBaseURI: "http://127.0.0.1:4318" }), "valid uri does not throw");
	t.end();
});

test("the constructor and clone copy the caller's options object instead of filling it", t => {
	const conf: LogConf = { context: { service: "x" }, format: "json" };
	const parent = new Log(conf);
	const childConf: LogConf = { parentLog: parent };

	new Log(childConf);
	parent.clone(conf);
	t.deepEqual(conf, { context: { service: "x" }, format: "json" }, "no default, inherited setting or formatter is written into it");
	t.deepEqual(Object.keys(childConf), ["parentLog"], "nothing inherited from the parent is written into a child's");
	t.strictEqual(parent.conf.logLevel, "info", "the instance still resolves its defaults");
	t.end();
});

test("the level-string shorthand still works and warns once per stderr sink", t => {
	const stderr: string[] = [];
	const realConsoleError = console.error;
	let afterSilent: number;
	let shorthand: Log;

	console.error = (line: string) => { stderr.push(line); };
	try {
		new Log("none");
		afterSilent = stderr.length;
		shorthand = new Log("debug");
	} finally {
		console.error = realConsoleError;
	}

	t.strictEqual(shorthand.conf.logLevel, "debug", "the shorthand still sets the level");
	t.strictEqual(afterSilent, 1, "logLevel \"none\" does not silence the warning");
	t.strictEqual(stderr.length, 1, "a second instance on the same sink stays quiet");
	t.ok(stderr[0].includes("war") && stderr[0].includes("new Log({ logLevel })"), "the constructor warning is a warn line naming the spelling to use instead");
	t.ok(stderr[0].includes("@larvit/log: "), "and names the package, so an app developer can tell which dependency emitted it");

	const cloneStderr: string[] = [];
	const parent = new Log({ colors: false, stderr: line => { cloneStderr.push(line); } });
	const clone = parent.clone("silly");

	parent.clone("error");
	t.strictEqual(clone.conf.logLevel, "silly", "clone's shorthand still sets the level");
	t.strictEqual(cloneStderr.length, 1, "clone warns once per sink, through the instance's stderr");
	t.ok(cloneStderr[0].includes("[war]") && cloneStderr[0].includes("log.clone({ logLevel })"), "the clone warning is a warn line naming the spelling to use instead");

	const secondStderr: string[] = [];

	new Log({ context: { service: "x" }, format: "json", stderr: line => { secondStderr.push(line); } }).clone("error");
	t.strictEqual(secondStderr.length, 1, "a second sink hears the same warning again");
	t.strictEqual(JSON.parse(secondStderr[0]).service, "x", "the warning carries the instance's context, like every other line");
	t.end();
});

test("entryFormatter still formats and warns once per stderr sink", t => {
	const { log, stderr, stdout } = capture({ entryFormatter: entry => `custom ${entry.msg}`, format: "json" });

	log.info("hi");
	t.strictEqual(stdout[0], "custom hi", "the deprecated formatter still formats output, and still wins over format: \"json\"");
	t.strictEqual(stderr.length, 1, "one warning per sink");
	t.strictEqual(stderr[0], "custom @larvit/log: entryFormatter is deprecated and removed in 3.0.0, use format — entryFormatter wins and the format beside it is ignored", "the warning goes through the instance's formatter, names the spelling to use instead and says which of the two wins");
	log.info("again");
	t.strictEqual(stderr.length, 1, "a second entry on the same sink stays quiet");

	const cloneStderr: string[] = [];
	const clone = log.clone({ stderr: line => { cloneStderr.push(line); } });

	clone.info("cloned");
	t.deepEqual(cloneStderr, [], "a clone inherits the formatter without repeating the warning on its own sink");
	t.strictEqual(stdout[stdout.length - 1], "custom cloned", "the clone kept the inherited formatter");

	const builtIn = capture({ entryFormatter: msgTextFormatter });

	builtIn.log.info("x");
	t.strictEqual(builtIn.stderr.length, 1, "a built-in formatter warns too; the warning does not depend on which function it is");
	t.ok(builtIn.stderr[0].endsWith("@larvit/log: entryFormatter is deprecated and removed in 3.0.0, use format"), "with no format beside it, the warning stops at the spelling to use");
	t.end();
});

test("format and entryFormatter are one setting, and a resolved conf carries neither spelling twice", t => {
	const own = (entry: EntryFormatterConf) => `own ${entry.msg}`;

	t.ok(thrown(() => new Log({ entryFormatter: own, format: entry => `other ${entry.msg}` })).includes("format"), "two different formatters, one per spelling, are rejected naming format");
	t.strictEqual(thrown(() => new Log({ entryFormatter: own, format: own, stderr: () => {} })), "", "the same formatter in both spellings is no disagreement");

	const parent = capture({ format: entry => `parent ${entry.msg}` });

	parent.log.clone({ entryFormatter: own }).info("hi");
	new Log({ entryFormatter: own, parentLog: parent.log }).info("hi");
	t.deepEqual(parent.stdout, ["own hi", "own hi"], "a clone and a child take the caller's formatter over the inherited format, alike");

	const pairStderr: string[] = [];

	parent.log.clone({ entryFormatter: own, format: "json", stderr: line => { pairStderr.push(line); } });
	t.ok(pairStderr[0]?.endsWith("@larvit/log: entryFormatter is deprecated and removed in 3.0.0, use format — entryFormatter wins and the format beside it is ignored"), "a clone holding both spellings hears the same warning the constructor gives");

	const spread = capture({ ...parent.log.conf, format: (entry: EntryFormatterConf) => `spread ${entry.msg}` });

	spread.log.info("hi");
	t.strictEqual(spread.stdout[0], "spread hi", "a resolved conf spread with a new format takes the new one");
	t.deepEqual(spread.stderr, [], "and warns about nothing: the resolved formatter is not a spelling the caller wrote");

	const json = capture({ ...capture().log.conf, format: "json" });

	json.log.info("hi");
	t.strictEqual(JSON.parse(json.stdout[0]).msg, "hi", "a string format applies to a spread conf too");
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

test("a transient export failure keeps the batch queued, reports one line and the retry delivers it", async t => {
	stubFetch(() => { throw new Error("connection refused"); });
	const stderr: string[] = [];
	const log = new Log({ otlpQueue: new Queue({ otlpHttpBaseURI: "http://127.0.0.1:1", report: (msg, metadata) => stderr.push(`${msg} ${JSON.stringify(metadata)}`), retryDelayMs: 20 }), stderr: () => {} });

	log.info("will fail to export");
	log.info("so will this");
	const ret = log.end();

	t.ok(ret && typeof ret.then === "function", "end() returns a thenable");
	await ret;
	t.strictEqual(stderr.length, 1, "one line for the failed batch, not one per record; the span batch is not attempted");
	t.ok(stderr[0].includes("127.0.0.1:1"), "the line names the endpoint url");
	t.ok(stderr[0].includes("connection refused"), "the line carries the error message");

	const { calls } = stubFetch();

	await log.flush();
	t.strictEqual(calls.length, 0, "flush() while a retry is pending attempts nothing; the backoff holds");
	await waitFor(() => calls.length === 2);
	t.deepEqual(calls.map(call => call.path), ["/v1/logs", "/v1/traces"], "the retry delivers the kept records, then the span");
	t.deepEqual(exportedRecords(calls), ["will fail to export", "so will this"], "both records survived the failure in order");
	t.end();
});

test("the Log-built queue reports through the instance's stderr and formatter", async t => {
	stubFetch(() => response({ status: 400 }));
	const stderr: string[] = [];
	const log = new Log({ format: "json", otlpHttpBaseURI: "http://127.0.0.1:4318", stderr: line => stderr.push(line) });

	log.info("x");
	await log.flush();
	t.strictEqual(stderr.length, 1, "one formatted line");

	const parsed = JSON.parse(stderr[0]);

	t.strictEqual(parsed.msg, "OTLP export rejected, batch dropped", "the message is the static report text");
	t.strictEqual(parsed.status, 400, "the report metadata are fields of the entry");
	t.strictEqual(parsed.logLevel, "error", "reported at level error");
	t.end();
});

test("a rejected export (4xx) drops the batch, reports one line per batch and does not retry", async t => {
	const { calls } = stubFetch(() => response({ status: 400 }));
	const stderr: string[] = [];
	const log = new Log({ otlpHttpBaseURI: "http://127.0.0.1:4318", stderr: line => stderr.push(line) });

	log.info("x");
	log.info("y");
	await log.end();

	t.deepEqual(calls.map(call => call.path), ["/v1/logs", "/v1/traces"], "each batch is attempted once");
	t.strictEqual(stderr.length, 2, "one line per rejected batch");
	t.ok(stderr[0].includes("400"), "the line carries the status");

	calls.length = 0;
	await log.flush();
	t.strictEqual(calls.length, 0, "nothing is left to send");
	t.end();
});

test("endpoint userinfo authenticates through an Authorization header, never through the url", async t => {
	const { calls } = stubFetch(() => response({ status: 400 }));
	const stderr: string[] = [];
	const endpoint = "http://collector:s3cr%40t%C3%A5@127.0.0.1:4318";
	const log = new Log({ otlpHttpBaseURI: endpoint, stderr: line => stderr.push(line) });

	log.info("x");
	await log.flush();

	t.strictEqual(calls[0].url, "http://127.0.0.1:4318/v1/logs", "the request url holds no credentials");
	t.strictEqual(callHeader(calls[0], "Authorization"), "Basic Y29sbGVjdG9yOnMzY3JAdMOl", "they are sent as percent-decoded Basic credentials, UTF-8 before base64");
	t.strictEqual(stderr.length, 1, "the rejected batch is reported");
	t.notOk(stderr.join("").includes("s3cr"), "no reported line carries the password");

	const explicit = new Log({ otlpAdditionalHeaders: { authorization: "Bearer token" }, otlpHttpBaseURI: endpoint, stderr: () => {} });

	explicit.info("y");
	await explicit.flush();
	t.strictEqual(callHeader(calls[1], "Authorization"), "Bearer token", "an explicit Authorization header wins over the userinfo, whatever its casing");

	const passwordOnly = new Log({ otlpHttpBaseURI: "http://:t0ken@127.0.0.1:4318", stderr: () => {} });

	passwordOnly.info("z");
	await passwordOnly.flush();
	t.strictEqual(callHeader(calls[2], "Authorization"), "Basic OnQwa2Vu", "an empty user-id still authenticates, as RFC 7617 allows");

	const plain = new Log({ otlpHttpBaseURI: "http://127.0.0.1:4318", stderr: () => {} });

	plain.info("w");
	await plain.flush();
	t.strictEqual(callHeader(calls[3], "Authorization"), null, "an endpoint without userinfo sends no Authorization header");
	t.end();
});

test("otlpAdditionalHeaders is read per send, and an invalid one fails the export, not the Log", async t => {
	const { calls } = stubFetch();
	const rotating = { Authorization: "Bearer first" };
	const log = new Log({ otlpAdditionalHeaders: rotating, otlpHttpBaseURI: "http://127.0.0.1:4318", stderr: () => {} });

	log.info("x");
	await log.flush();
	rotating.Authorization = "Bearer second";
	log.info("y");
	await log.flush();
	t.deepEqual(calls.map(call => callHeader(call, "Authorization")), ["Bearer first", "Bearer second"], "a rotated token reaches the next send without a new queue");

	const reports = reportSink();
	const invalid = new Log({ otlpQueue: new Queue({ otlpAdditionalHeaders: { "X-Bad Name": "s3cr3t" }, otlpHttpBaseURI: "http://127.0.0.1:4318", report: reports.report }), stderr: () => {} });

	invalid.info("z");
	await invalid.flush();
	t.strictEqual(calls.length, 2, "nothing is sent with a header the runtime rejects");
	t.deepEqual(reports.lines, [{ error: "otlpAdditionalHeaders carries an invalid X-Bad Name header", items: 1, msg: "OTLP export headers invalid, batch dropped", path: "/v1/logs", url: "http://127.0.0.1:4318/v1/logs" }], "the batch is dropped under its own message, naming the header but never its value");
	t.notOk(JSON.stringify(reports.lines).includes("s3cr3t"), "the rejected header value is not reported");
	t.end();
});

test("any 2xx is JSON export success; a partialSuccess rejected count is reported once and never retried", async t => {
	let second = false;
	const { calls } = stubFetch(path => {
		if (second) return response({ json: { partialSuccess: path === "/v1/logs" ? { rejectedLogRecords: 2 } : { rejectedSpans: "1" } } });
		if (path === "/v1/logs") return response({ json: { partialSuccess: { errorMessage: "too old", rejectedLogRecords: "1" } } });

		return { ...response({ status: 202 }), json: () => Promise.reject(new SyntaxError("Unexpected end of JSON input")) };
	});
	const reports = reportSink();
	const queue = new Queue({ otlpHttpBaseURI: "http://127.0.0.1:4318", report: reports.report });
	const log = new Log({ otlpQueue: queue, stderr: () => {} });

	log.info("x");
	log.info("y");
	await log.end();

	t.deepEqual(calls.map(call => call.path), ["/v1/logs", "/v1/traces"], "both batches are sent");
	t.deepEqual(reports.lines, [{ error: "too old", items: 2, msg: "OTLP export partially rejected", path: "/v1/logs", rejected: 1, status: 200, url: "http://127.0.0.1:4318/v1/logs" }], "the rejection is one line with the count; the 202 with no body is plain success");

	calls.length = 0;
	await log.flush();
	t.strictEqual(calls.length, 0, "neither batch is retried");

	second = true;
	const later = new Log({ otlpQueue: queue, stderr: () => {} });

	later.info("z");
	await later.end();
	t.deepEqual(reports.lines.slice(1), [
		{ items: 1, msg: "OTLP export partially rejected", path: "/v1/logs", rejected: 2, status: 200, url: "http://127.0.0.1:4318/v1/logs" },
		{ items: 1, msg: "OTLP export partially rejected", path: "/v1/traces", rejected: 1, status: 200, url: "http://127.0.0.1:4318/v1/traces" },
	], "a number count and rejectedSpans are read the same way");
	t.end();
});

test("Queue retries a failed batch with doubling backoff, capped at 30 s, until it is accepted", async t => {
	const clock = fakeClock();
	const delays = [1000, 2000, 4000, 8000, 16000, 30000, 30000];
	let attempts = 0;
	const { calls } = stubFetch(() => {
		attempts++;

		return attempts <= delays.length ? response({ status: 503 }) : undefined;
	});
	const reports = reportSink();
	const log = new Log({ clock, otlpQueue: new Queue({ clock, otlpHttpBaseURI: "http://127.0.0.1:4318", report: reports.report }), stderr: () => {} });

	log.warn("keep me");
	await log.flush();
	t.strictEqual(attempts, 1, "flush() attempts once and returns");

	for (const [index, delay] of delays.entries()) {
		await clock.advance(delay - 1);
		t.strictEqual(attempts, index + 1, `no retry before ${delay} ms have passed`);
		await clock.advance(1);
	}

	t.strictEqual(attempts, delays.length + 1, "the accepted attempt is the last one");
	t.deepEqual(exportedRecords(calls), Array(attempts).fill("keep me"), "the same batch is retried until accepted");
	t.deepEqual(reports.lines.map(line => line.msg), Array(delays.length).fill("OTLP export failed, will retry"), "one line per failed attempt");
	t.deepEqual(reports.lines.map(line => line.retryInMs), delays, "the delay doubles from retryDelayMs and stops at the 30 s cap");
	t.strictEqual(reports.lines[0].status, 503, "the status is in the metadata");
	t.strictEqual(reports.lines[0].items, 1, "the batch size is in the metadata");
	t.strictEqual(clock.pending.size, 0, "no timer is left pending once the batch is delivered");
	t.end();
});

test("Queue batches by time and by size, with keepalive under the browser cap", async t => {
	const { calls } = stubFetch();
	const clock = fakeClock();
	const log = new Log({ clock, otlpQueue: new Queue({ clock, otlpHttpBaseURI: "http://127.0.0.1:4318" }), stderr: () => {} });

	log.info("one");
	log.info("two");
	t.strictEqual(calls.length, 0, "nothing is sent synchronously");
	await clock.advance(999);
	t.strictEqual(calls.length, 0, "nothing is sent before batchDelayMs has passed");
	await clock.advance(1);
	t.strictEqual(calls.length, 1, "the timer sends both records in one POST");
	t.deepEqual(exportedRecords(calls), ["one", "two"], "both records, in order");
	t.strictEqual(calls[0].keepalive, true, "a batch under 64 KiB is sent with keepalive");

	calls.length = 0;
	const sized = new Log({ clock, otlpQueue: new Queue({ batchDelayMs: 10000, clock, maxBatchBytes: 2500, otlpHttpBaseURI: "http://127.0.0.1:4318" }), stderr: () => {} });

	sized.info("a".repeat(700));
	sized.info("b".repeat(700));
	t.strictEqual(calls.length, 0, "two records under maxBatchBytes wait for the timer");
	sized.info("c".repeat(700));
	await clock.settle();
	t.deepEqual(calls.map(call => call.body.resourceLogs[0].scopeLogs[0].logRecords.length), [2, 1], "reaching maxBatchBytes sends now, split into batches that fit");

	calls.length = 0;
	sized.info("d".repeat(70000));
	await clock.settle();
	t.strictEqual(calls[0].keepalive, false, "a body over 64 KiB is sent without keepalive rather than rejected by the browser");
	t.end();
});

test("Queue is bounded: drops the oldest when full and reports the count once", async t => {
	const { calls } = stubFetch();
	const reports = reportSink();
	const throwingReport = (msg: string, metadata: DefinedMetadata) => {
		reports.report(msg, metadata);
		throw new Error("sink broke");
	};
	const log = new Log({ otlpQueue: new Queue({ batchDelayMs: 10000, maxItems: 2, otlpHttpBaseURI: "http://127.0.0.1:4318", report: throwingReport }), stderr: () => {} });

	log.info("1");
	log.info("2");
	log.info("3");
	log.info("4");
	await log.flush();

	t.deepEqual(exportedRecords(calls), ["3", "4"], "the two newest records are kept");
	t.deepEqual(reports.lines, [{ dropped: 2, msg: "OTLP queue full, oldest items dropped" }], "one line with the count, and a throwing sink did not break the round");
	t.end();
});

test("Queue with storage survives a restart: leftovers go first and storage empties on delivery", async t => {
	for (const async of [false, true]) {
		const label = async ? "async storage" : "sync storage";
		const storage = fakeStorage(async);
		const otlpHttpBaseURI = "http://127.0.0.1:4318";

		stubFetch(() => { throw new Error("offline"); });
		const before = new Log({ otlpQueue: new Queue({ otlpHttpBaseURI, report: () => {}, retryDelayMs: 3600000, storage }), stderr: () => {} });

		before.info("before restart");
		await before.end();
		await waitFor(() => (storage.data.get("@larvit/log:otlp-queue") ?? "").includes("before restart"));
		t.strictEqual(storage.data.size, 1, `${label}: the undelivered records and span are persisted under the default key`);

		const { calls } = stubFetch();
		const after = new Log({ otlpQueue: new Queue({ otlpHttpBaseURI, report: () => {}, storage }), stderr: () => {} });

		after.info("after restart");
		await after.flush();
		t.deepEqual(exportedRecords(calls), ["before restart", "after restart"], `${label}: leftovers are sent before new records`);
		t.strictEqual(exportedSpans(calls).length, 1, `${label}: the persisted span is delivered too`);
		await waitFor(() => storage.data.size === 0);
		t.strictEqual(storage.data.size, 0, `${label}: storage is cleared once everything is delivered`);
	}

	const corrupt = fakeStorage(false);
	const reports = reportSink();

	corrupt.data.set("custom-key", "not json");
	const { calls } = stubFetch();
	const log = new Log({ otlpQueue: new Queue({ key: "custom-key", otlpHttpBaseURI: "http://127.0.0.1:4318", report: reports.report, storage: corrupt }), stderr: () => {} });

	log.info("still works");
	await log.flush();
	t.deepEqual(exportedRecords(calls), ["still works"], "corrupt stored data does not block new records");
	t.deepEqual(reports.lines.map(line => line.msg), ["OTLP queue storage unreadable, discarded"], "corrupt data is reported once");
	await waitFor(() => corrupt.data.size === 0);
	t.strictEqual(corrupt.data.size, 0, "the custom key is cleared");

	const broken = fakeStorage(false);
	const brokenReports = reportSink();

	broken.setItem = () => { throw new Error("quota exceeded"); };
	calls.length = 0;
	const unsaved = new Log({ otlpQueue: new Queue({ otlpHttpBaseURI: "http://127.0.0.1:4318", report: brokenReports.report, storage: broken }), stderr: () => {} });

	unsaved.info("delivered anyway");
	await unsaved.flush();
	t.deepEqual(exportedRecords(calls), ["delivered anyway"], "a storage that cannot be written still exports");
	await waitFor(() => brokenReports.lines.length > 0);
	t.deepEqual(brokenReports.lines.map(line => line.msg), ["OTLP queue storage write failed"], "the write failure is reported");
	t.end();
});

test("log.flush() delivers pending records without ending the span", async t => {
	const { calls } = stubFetch();
	const log = new Log({ otlpHttpBaseURI: "http://127.0.0.1:4318", stderr: () => {} });

	log.info("early");
	await log.flush();
	t.deepEqual(calls.map(call => call.path), ["/v1/logs"], "records are sent, the span is not");
	t.strictEqual(log.ended, false, "the instance is still usable");

	log.info("late");
	await log.end();
	t.deepEqual(calls.map(call => call.path), ["/v1/logs", "/v1/logs", "/v1/traces"], "end() sends what came after, then the span");
	t.end();
});

test("otlpQueue and the otlp* options are two spellings of one endpoint; inheritance never mixes them", t => {
	const queue = new Queue({ otlpHttpBaseURI: "http://127.0.0.1:4318" });

	t.ok(thrown(() => new Log({ otlpHttpBaseURI: "http://127.0.0.1:4319", otlpQueue: queue })).includes("otlpQueue"), "a queue plus a differing endpoint on Log is rejected, naming the option");
	t.ok(thrown(() => new Log({ otlpProtocol: "http/protobuf", otlpQueue: queue })).includes("otlpQueue"), "a queue plus a differing protocol on Log is rejected");

	const parent = new Log({ otlpHttpBaseURI: "http://127.0.0.1:4318", otlpProtocol: "http/protobuf" });

	t.ok(parent.conf.otlpQueue instanceof Queue, "otlpHttpBaseURI builds a Queue");
	t.strictEqual(new Log({ parentLog: parent }).conf.otlpQueue, parent.conf.otlpQueue, "a child shares the parent's queue");
	t.strictEqual(parent.clone().conf.otlpQueue, parent.conf.otlpQueue, "a clone shares the queue");
	t.notStrictEqual(new Log({ otlpHttpBaseURI: "http://127.0.0.1:4319", parentLog: parent }).conf.otlpQueue, parent.conf.otlpQueue, "a child with its own endpoint gets its own queue");

	const proto = new Log({ otlpProtocol: "http/json", parentLog: parent });

	t.strictEqual(proto.conf.otlpHttpBaseURI, parent.conf.otlpHttpBaseURI, "overriding one transport option still inherits the others");
	t.notStrictEqual(proto.conf.otlpQueue, parent.conf.otlpQueue, "into a queue of its own");

	const custom = new Log({ otlpQueue: queue, parentLog: parent });

	t.strictEqual(custom.conf.otlpQueue, queue, "a child keeps the queue it was given");
	t.strictEqual(custom.conf.otlpHttpBaseURI, undefined, "and does not inherit the parent's endpoint beside it");
	t.doesNotThrow(() => new Log({ ...parent.conf, spanName: "sibling" }), "spreading a conf keeps its queue and endpoint together");
	t.end();
});

test("a custom OtlpQueue receives every record and span, and end() flushes it", async t => {
	const payloads: OtlpPayload[] = [];
	let flushes = 0;
	const otlpQueue: OtlpQueue = {
		enqueue: payload => { payloads.push(payload); },
		flush: () => {
			flushes++;

			return Promise.resolve();
		},
	};

	stubFetch();
	const log = new Log({ otlpQueue, stderr: () => {} });

	log.info("hi");
	await log.fetch("https://api.test/x");
	await log.end();

	t.deepEqual(payloads.map(payload => "resourceLogs" in payload ? "logs" : "spans"), ["logs", "spans", "spans"], "a record, the client span, then the instance span");
	t.strictEqual(flushes, 1, "end() flushed the queue");
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

test("OTLP/JSON batches the records into one POST and exports one span sharing trace/span ids", async t => {
	const { calls } = stubFetch();
	const clock = fakeClock();
	const startedAt = clock.now();
	const log = new Log({
		clock,
		context: { region: undefined, "service.name": "eva-bosse" },
		otlpHttpBaseURI: "http://127.0.0.1:4318",
		spanName: "lur-bert",
		stderr: () => {},
	});

	log.warn("FOo", { active: true, bar: "baz", "lökig knasnyckel | typ": 17, missing: undefined });
	await clock.advance(250);
	log.error("logged and recovered");
	await clock.advance(749);
	t.strictEqual(calls.length, 0, "the queue the Log built has not batched yet");
	await clock.advance(1);
	t.deepEqual(calls.map(call => call.path), ["/v1/logs"], "the queue the Log built batches on the instance's clock, without an end()");
	await log.end();

	t.ok(calls.every(call => call.contentType === "application/json"), "default protocol sends JSON");

	const logsBody: any = calls.find(call => call.path === "/v1/logs")!.body;
	const tracesBody: any = calls.find(call => call.path === "/v1/traces")!.body;
	const resourceAttr = (attrs: any[], key: string) => attrs.find(attr => attr.key === key)?.value.stringValue;

	// One POST per batch; records under one resource share one resourceLog and scopeLog.
	t.strictEqual(calls.filter(call => call.path === "/v1/logs").length, 1, "both records go in one POST");
	t.strictEqual(logsBody.resourceLogs.length, 1, "one resourceLog for both records");
	t.strictEqual(logsBody.resourceLogs[0].scopeLogs.length, 1, "one scopeLog");
	t.strictEqual(logsBody.resourceLogs[0].scopeLogs[0].logRecords.length, 2, "both logRecords under it");
	t.strictEqual(tracesBody.resourceSpans.length, 1, "one resourceSpan");
	t.strictEqual(tracesBody.resourceSpans[0].scopeSpans.length, 1, "one scopeSpan");
	t.strictEqual(tracesBody.resourceSpans[0].scopeSpans[0].spans.length, 1, "one span");

	const logRecord = logsBody.resourceLogs[0].scopeLogs[0].logRecords[0];

	t.strictEqual(logRecord.body.stringValue, "FOo", "log body");
	t.strictEqual(logRecord.severityNumber, 13, "severityNumber is WARN (13)");
	t.strictEqual(logRecord.severityText, "WARN", "severityText is WARN");
	t.strictEqual(logRecord.timeUnixNano, nanos(startedAt), "log timeUnixNano is the instant the entry was written");
	t.strictEqual(logsBody.resourceLogs[0].scopeLogs[0].logRecords[1].timeUnixNano, nanos(startedAt + 250), "the second record carries its own, later instant");
	t.deepEqual(
		logRecord.attributes,
		[
			{ key: "active", value: { stringValue: "true" } },
			{ key: "bar", value: { stringValue: "baz" } },
			{ key: "lökig knasnyckel | typ", value: { stringValue: "17" } },
		],
		"metadata attributes are coerced to strings, in insertion order; undefined keys are dropped",
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
	t.deepEqual(span.status, { code: 0 }, "span status is ok: a logged error does not fail the span");
	t.strictEqual(span.attributes.length, 0, "no span attributes (context held only service.name and an undefined key)");
	t.strictEqual(span.links.length, 0, "span has no links");
	t.strictEqual(span.droppedLinksCount, 0, "span has no dropped links");
	t.strictEqual(span.traceId, logRecord.traceId, "span and log share the traceId");
	t.strictEqual(span.spanId, logRecord.spanId, "span and log share the spanId");
	t.strictEqual(span.startTimeUnixNano, nanos(startedAt), "span startTimeUnixNano is the construction instant");
	t.strictEqual(span.endTimeUnixNano, nanos(startedAt + 1000), "span endTimeUnixNano is the end() instant");
	t.end();
});

test("end({ error }) marks the span failed", async t => {
	const { calls } = stubFetch();
	const exportedSpan = (index: number) => exportedSpans(calls)[index];
	const attr = (span: any, key: string) => span.attributes.find((attribute: any) => attribute.key === key)?.value.stringValue;
	const conf = { context: { region: "eu" }, otlpHttpBaseURI: "http://127.0.0.1:4318", stderr: () => {} };

	await new Log(conf).end({ error: Object.assign(new TypeError("refused"), { code: "ECONNREFUSED" }) });
	await new Log(conf).end({ error: new RangeError("too big") });
	await new Log(conf).end({ error: "plain string" });
	await new Log(conf).end({ error: undefined });
	await new Log(conf).end({ error: null });
	await new Log(conf).end({ error: Object.create(null) });
	// The rejection a runtime hands back for a credentialed url, forwarded by the handler pattern
	// the README documents.
	await new Log(conf).end({ error: new TypeError("Request cannot be constructed from a URL that includes credentials: http://myuser:hunter2@api.test/x") });
	await new Log(conf).end({ error: new Error("GET https://api.test/mail@example.com?to=a@b failed") });

	t.deepEqual(exportedSpan(0).status, { code: 2, message: "refused" }, "status is ERROR with the error message");
	t.strictEqual(attr(exportedSpan(0), "error.type"), "ECONNREFUSED", "error.type is the error's code when it has one");
	t.strictEqual(attr(exportedSpan(0), "region"), "eu", "context attributes are kept beside error.type");
	t.deepEqual(exportedSpan(1).status, { code: 2, message: "too big" }, "status message from an error without a code");
	t.strictEqual(attr(exportedSpan(1), "error.type"), "RangeError", "error.type falls back to the error's name");
	t.deepEqual(exportedSpan(2).status, { code: 2, message: "plain string" }, "a non-Error value is stringified into the status message");
	t.strictEqual(attr(exportedSpan(2), "error.type"), "_OTHER", "error.type is the semconv fallback when there is neither code nor name");
	t.deepEqual(exportedSpan(3).status, { code: 0 }, "end({ error: undefined }) leaves the span ok");
	t.notOk(attr(exportedSpan(3), "error.type"), "no error.type without an error");
	t.deepEqual(exportedSpan(4).status, { code: 0 }, "end({ error: null }) leaves the span ok, for callback-style errors");
	t.deepEqual(exportedSpan(5).status, { code: 2, message: "_OTHER" }, "a value that cannot be stringified still ends and exports the span");
	t.deepEqual(exportedSpan(6).status, { code: 2, message: "Request cannot be constructed from a URL that includes credentials: http://REDACTED@api.test/x" }, "userinfo in a url the error message quotes is redacted");
	t.deepEqual(exportedSpan(7).status, { code: 2, message: "GET https://api.test/mail@example.com?to=a@b failed" }, "an @ outside the userinfo position is left alone");
	t.end();
});

test("OTLP protobuf encodes logs and spans on the wire", async t => {
	const { calls } = stubFetch();
	const clock = fakeClock();
	const startedAt = clock.now();
	const log = new Log({
		clock,
		context: { "service.name": "proto-svc" },
		otlpHttpBaseURI: "http://127.0.0.1:4318",
		otlpProtocol: "http/protobuf",
		spanName: "proto-span",
		stderr: () => {},
	});

	log.warn("protobuf works", { active: true, count: 17, foo: "bar" });
	log.warn("batched too");
	await clock.advance(400);
	await log.end({ error: new Error("proto failed") });

	const logsCall = calls.find(call => call.path === "/v1/logs")!;
	const tracesCall = calls.find(call => call.path === "/v1/traces")!;

	t.strictEqual(logsCall.contentType, "application/x-protobuf", "logs are sent as protobuf");
	t.strictEqual(tracesCall.contentType, "application/x-protobuf", "traces are sent as protobuf");
	t.strictEqual(pbMsg(pbMsg(pbDecode(logsCall.rawBody).get(1)![0]).get(2)![0]).get(2)!.length, 2, "both records under one resource_logs/scope_logs on the wire");

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
	t.strictEqual(logRecord.timeUnixNano, nanos(startedAt), "decoded log timeUnixNano is the instant the entry was written");

	t.strictEqual(scopeName, "proto-span", "scope name is the span name");
	t.strictEqual(span.name, "proto-span", "decoded span name matches");
	t.strictEqual(span.kind, 1, "decoded span kind is 1");
	t.strictEqual(span.statusCode, 2, "decoded span status code is ERROR (2)");
	t.strictEqual(span.statusMessage, "proto failed", "decoded span status message is the error message");
	t.deepEqual(span.attributes, [{ key: "error.type", value: { stringValue: "Error" } }], "error.type is a span attribute on the wire");
	t.strictEqual(span.traceId, logRecord.traceId, "span and log share the traceId");
	t.strictEqual(span.spanId, logRecord.spanId, "span and log share the spanId");
	t.strictEqual(spanResourceAttrs.find(attr => attr.key === "service.name")!.value.stringValue, "proto-svc", "service.name is on the span resource");
	t.strictEqual(span.startTimeUnixNano, nanos(startedAt), "decoded span startTimeUnixNano is the construction instant");
	t.strictEqual(span.endTimeUnixNano, nanos(startedAt + 400), "decoded span endTimeUnixNano is the end() instant");
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

	// A clone is its own trace, never re-adopting the base's traceparent.
	t.notStrictEqual(adopted.clone().span.traceId, adopted.span.traceId, "clone starts its own trace");
	t.end();
});

test("log.traceparent() emits the current span context", t => {
	const log = new Log();

	t.strictEqual(log.traceparent(), formatTraceparent(log.span.traceId, log.span.spanId), "emitted header carries this span's context");
	t.strictEqual(log.sampled, true, "a fresh trace is sampled");
	t.end();
});

test("an unsampled traceparent exports nothing, passes 00 on and still prints", async t => {
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
	t.strictEqual(calls.filter(call => call.path !== "/x").length, 0, "no record or span reaches the collector");
	t.strictEqual(stdout.length, 2, "console output is unaffected");

	clone.info("clone record");
	await clone.end();

	t.strictEqual(calls.filter(call => call.path === "/v1/logs").length, 1, "the clone's record exports");
	t.strictEqual(exportedSpans(calls).map(span => span.name).join(","), "clone", "only the clone's span exports");
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

	await log.fetch("http://myuser:hunter2@127.0.0.1:45231/x").catch((err: Error) => { rejection = err.message; });
	await log.end();

	const span = clientSpan(calls);
	const urlFull = span.attributes.find((attribute: any) => attribute.key === "url.full").value.stringValue;

	t.ok(rejection.includes("hunter2"), "the runtime's own rejection, credentials and all, reaches the caller");
	t.ok(!JSON.stringify(span).includes("hunter2"), "the password is nowhere on the span");
	t.ok(!JSON.stringify(span).includes("myuser"), "the username is nowhere on the span");
	t.strictEqual(urlFull, "http://127.0.0.1:45231/x", "url.full keeps the url without the userinfo");
	t.strictEqual(span.status.code, 2, "the span is ERROR");
	// The wording around it differs between Node and the browser; the redaction does not.
	t.ok(span.status.message.includes("http://REDACTED@127.0.0.1:45231/x"), "the runtime's own message survives with the userinfo redacted");
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
		if (path === "/abort") throw new DOMException("aborted", "AbortError");

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
	await log.end();

	const spans = exportedSpans(calls);
	const attr = (span: any, key: string) => span.attributes.find((attribute: any) => attribute.key === key)?.value.stringValue;
	const span404 = spans.find(span => attr(span, "http.response.status_code") === "404")!;
	const spanBoom = spans.find(span => attr(span, "error.type") === "ECONNREFUSED")!;

	t.deepEqual(span404.status, { code: 2 }, "the 4xx span is ERROR without a status message");
	t.deepEqual(spanBoom.status, { code: 2, message: "down" }, "the network-failure span is ERROR with the error message");
	t.strictEqual(attr(spanBoom, "error.type"), "ECONNREFUSED", "error.type captured from the error code");
	t.ok(spans.some(span => attr(span, "error.type") === "AbortError"), "a numeric code (DOMException) is skipped for the error name");
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
