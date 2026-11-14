import { type EntryFormatter, type EntryFormatterConf, generateSpanId, generateTraceId, Log, type LogConf, type Logger, type LogInt, type LogLevel, LogLevels, type LogOptions, type Metadata, msgJsonFormatter, msgTextFormatter, Queue, type ResolvedLogConf, resolveFormatter } from "../index.js";
import { colorsFromEnv } from "../log/entry-format.js";
import test from "./tap.js";
import { capture, clientSpan, fakeClock, stubFetch, thrown } from "./test-doubles.js";

for (const { level, stream, token } of [
	{ level: "error", stream: "stderr", token: "\x1b[1;31merr\x1b[0m" },
	{ level: "warn", stream: "stderr", token: "\x1b[1;33mwar\x1b[0m" },
	{ level: "info", stream: "stdout", token: "\x1b[1;32minf\x1b[0m" },
	{ level: "verbose", stream: "stdout", token: "\x1b[1;34mver\x1b[0m" },
	{ level: "debug", stream: "stdout", token: "\x1b[1;35mdeb\x1b[0m" },
	{ level: "silly", stream: "stdout", token: "\x1b[1;37msil\x1b[0m" },
] as const) {
	test(`${level} writes its colored token to ${stream}`, t => {
		const cap = capture({ colors: true, logLevel: "silly" }); // silly passes every level through the filter

		cap.log[level]("msg");
		t.strictEqual(cap[stream][0]?.substring(23), `Z [${token}] msg`, `${level} -> ${stream} with its token`);
		t.end();
	});
}

test("colors: false writes the bare tag, and msgTextFormatter colours unless it is false", t => {
	const plain = capture({ colors: false });

	plain.log.info("msg");
	t.strictEqual(plain.stdout[0]?.substring(23), "Z [inf] msg", "colors: false writes the bare tag");
	t.ok(msgTextFormatter({ logLevel: "info", msg: "msg" }).includes("\x1b[1;32minf\x1b[0m"), "msgTextFormatter colours unless colors is false");
	t.strictEqual(msgTextFormatter({ colors: false, logLevel: "info", msTimestamp: Date.UTC(2022, 8, 24, 23, 40, 39, 7), msg: "msg" }), "2022-09-24T23:40:39.007Z [inf] msg", "the time keeps its milliseconds, so entries within a second keep their order");
	t.end();
});

const throwingEnv = new Proxy({}, { get: () => { throw new Error("permission denied"); } });

for (const [env, expected, name] of [
	[undefined, undefined, "no env, as in a browser, leaves the default"],
	[{}, undefined, "neither variable leaves the default"],
	[{ NO_COLOR: "1" }, false, "NO_COLOR turns colour off"],
	[{ NO_COLOR: "" }, undefined, "an empty NO_COLOR does not count"],
	[{ FORCE_COLOR: "1" }, true, "FORCE_COLOR turns colour on"],
	[{ FORCE_COLOR: "" }, true, "an empty FORCE_COLOR turns colour on, as in Node"],
	[{ FORCE_COLOR: "0" }, false, "FORCE_COLOR=0 turns colour off"],
	[{ FORCE_COLOR: "false" }, false, "FORCE_COLOR=false turns colour off"],
	[{ FORCE_COLOR: "1", NO_COLOR: "1" }, false, "NO_COLOR wins over FORCE_COLOR"],
	[throwingEnv, undefined, "an env that throws on read leaves the default"],
] as const) {
	test(`colorsFromEnv: ${name}`, t => {
		t.strictEqual(colorsFromEnv(env), expected, name);
		t.end();
	});
}

// The one test that swaps the process global, to prove the default reads it.
test("colors unset in code follows the process env, defaulting to on; set in code it ignores the env", t => {
	const original: unknown = Reflect.get(globalThis, "process");
	const env: Record<string, string> = { NO_COLOR: "1" };
	let fromEnv: boolean;
	let inCode: boolean;
	let unset: boolean;

	Reflect.set(globalThis, "process", { env });
	try {
		fromEnv = new Log().conf.colors;
		inCode = new Log({ colors: true }).conf.colors;
		delete env.NO_COLOR;
		unset = new Log().conf.colors;
	} finally {
		if (original === undefined) {
			Reflect.deleteProperty(globalThis, "process");
		} else {
			Reflect.set(globalThis, "process", original);
		}
	}

	t.strictEqual(fromEnv, false, "NO_COLOR in the process env turns it off");
	t.strictEqual(inCode, true, "colors: true in code wins over NO_COLOR");
	t.strictEqual(unset, true, "on when the env says nothing");
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

	// What a JavaScript consumer passes from LOG_LEVEL=trace (pino) or http (winston).
	const unknownLevel: any = "trace";
	const unknown = capture({ colors: false, logLevel: unknownLevel });

	t.doesNotThrow(() => {
		unknown.log.info("x");
		unknown.log.verbose("x");
		unknown.log.error("x");
	}, "an unknown logLevel never throws from a level method");
	t.strictEqual(unknown.stdout.length, 1, "an unknown logLevel logs at the default, info");
	t.strictEqual(unknown.stderr.length, 2, "one warning beside the error line");
	t.ok(unknown.stderr[0].includes("[war] @larvit/log: logLevel \"trace\" is not a level"), "the warning names the package and the value");
	t.ok(unknown.stderr[0].includes("error, warn, info, verbose, debug, silly or none"), "and the values to use instead");
	t.strictEqual(unknown.log.enabled(unknownLevel), false, "enabled() is false for an unknown level, never a throw");
	unknown.log.conf.logLevel = unknownLevel;
	unknown.log.info("x");
	t.strictEqual(unknown.stderr.length, 2, "the warning is written once per sink and value");

	// A JavaScript caller can pass null, which the types forbid.
	const nulled = capture({ colors: null as unknown as boolean, logLevel: null as unknown as LogLevel });

	nulled.log.info("x");
	t.ok(nulled.stderr[0]?.includes("logLevel null is not a level"), "a null logLevel is not unset: it warns like any other bad value");
	t.strictEqual(nulled.log.conf.colors, null, "and a null colors is kept, not replaced by the default");

	const asked = capture({ colors: false, logLevel: unknownLevel });

	t.strictEqual(asked.log.enabled("info"), true, "enabled() treats an unknown logLevel as info");
	t.strictEqual(asked.log.enabled("debug"), false, "and below it as disabled");
	t.strictEqual(asked.stderr.length, 0, "enabled() never writes a warning");
	asked.log.silly("x");
	t.strictEqual(asked.stderr.length, 1, "a level method warns even for a call below the threshold");

	const live = capture({ colors: false, context: { requestId: "01a0d9b5-8ddc-743e-8555-76c9875b7d9d" } });
	const prototypeKey: any = "constructor";
	const numericLevel: any = 30;

	live.log.conf.logLevel = prototypeKey;
	live.log.info("x");
	t.strictEqual(live.stdout.length, 1, "a live write is checked where a line is written, and a prototype key is no level");
	t.ok(live.stderr[0].includes("logLevel \"constructor\" is not a level"), "and warns");
	t.notOk(live.stderr[0].includes("01a0d9b5-8ddc-743e-8555-76c9875b7d9d"), "a config warning carries no instance context");
	live.log.conf.logLevel = numericLevel;
	live.log.info("x");
	t.ok(live.stderr[1].includes("logLevel 30 is not a level"), "a number is quoted as a number");

	const arrayLevel: any = ["debug"];
	const hostileLevel: any = { toString() { throw new Error("toString called"); } };
	const nullLevel: any = null;

	live.log.conf.logLevel = arrayLevel;
	live.log.debug("x");
	t.strictEqual(live.stdout.length, 2, "an array holding a level is no level");
	t.ok(live.stderr[2].includes("logLevel [\"debug\"] is not a level"), "and warns, naming the strings it holds");
	live.log.conf.logLevel = hostileLevel;
	t.doesNotThrow(() => live.log.info("x"), "a value's own toString is never called");
	t.ok(live.stderr[3].includes("logLevel [object Object] is not a level"), "and warns");
	live.log.conf.logLevel = nullLevel;
	live.log.info("x");
	t.ok(live.stderr[4].includes("logLevel null is not a level"), "null is printed as null");

	const trapLevel: any = new Proxy([], { get() { throw new Error("trap called"); } });

	live.log.conf.logLevel = trapLevel;
	t.doesNotThrow(() => live.log.info("x"), "a value that throws while it is described never throws from a level method");
	t.ok(live.stderr[5].includes("logLevel (a value that cannot be printed) is not a level"), "and still warns");
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
	const formatter = (entry: EntryFormatterConf) => `${entry.logLevel}|${entry.msg}`;
	const { log, stderr, stdout } = capture({ format: formatter });
	const asLogInt: LogInt = log;
	// Typed, not inferred: widening either read type again fails the build here.
	const confRead: "json" | "text" | undefined = log.conf.format;
	const logIntRead: "json" | "text" | undefined = asLogInt.conf.format;

	t.strictEqual(confRead, undefined, "conf.format keeps v2.3.0's read type, so a function formatter never lands in it");
	t.strictEqual(logIntRead, undefined, "and so does LogInt's conf");
	t.strictEqual(log.conf.entryFormatter, formatter, "conf.entryFormatter reads the function back");
	log.info("hi");
	log.clone().info("cloned");
	new Log({ parentLog: log }).info("child");
	t.deepEqual(stdout, ["info|hi", "info|cloned", "info|child"], "the function formats the instance's output and is inherited");
	t.deepEqual(stderr, [], "the supported spelling warns about nothing");
	new Log({ format: "json", parentLog: log }).info("own");
	t.strictEqual(JSON.parse(stdout[3]).msg, "own", "a child's own format wins over the inherited one");

	const other = new Log({ format: entry => `other ${entry.msg}` });

	log.clone({ parentLog: other }).info("nested");
	log.clone().clone({ parentLog: other }).info("deep");
	t.deepEqual(stdout.slice(4), ["info|nested", "info|deep"], "a clone given a parentLog keeps its source's formatter");

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
	const meta: Metadata = { count: 5, user: "abc" };
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
	t.ok(Array.from({ length: 64 }, generateTraceId).some(id => !id.startsWith("01")), "traceId's first byte is not fixed");
	t.end();
});

test("randomBytes decides every trace and span id, and children and clones inherit it", async t => {
	const { calls } = stubFetch();
	let counter = 0;
	const randomBytes = (size: number): Uint8Array => new Uint8Array(size).fill(++counter);
	const log = new Log({ otlpHttpBaseURI: "http://127.0.0.1:4318", randomBytes, stderr: () => {} });

	t.strictEqual(log.span.spanId, "0101010101010101", "the first draw is the span id");
	t.strictEqual(log.span.traceId, "02020202020202020202020202020202", "the second draw is the trace id");
	t.strictEqual(log.conf.randomBytes, randomBytes, "log.conf reads the option back");

	const child = new Log({ parentLog: log, stderr: () => {} });

	t.strictEqual(child.span.spanId, "03".repeat(8), "a child draws its span id from the inherited function");
	t.strictEqual(child.span.traceId, log.span.traceId, "a child continues its parent's trace");
	t.strictEqual(log.clone().conf.randomBytes, randomBytes, "a clone inherits it");

	await log.fetch("https://api.test/x");
	await log.end();

	t.strictEqual(clientSpan(calls).spanId, "06".repeat(8), "a log.fetch span id comes from it too, after the clone's span and trace id");
	t.strictEqual(typeof new Log({ stderr: () => {} }).conf.randomBytes, "function", "unset, log.conf holds the platform's randomness");
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

test("a clone merges context and takes no spanName; a child replaces context and inherits spanName", t => {
	const log = new Log({ context: { foo: "bar" }, spanName: "parent" });

	t.strictEqual(log.clone().span.name, "unnamed-span", "a clone takes no spanName");
	t.strictEqual(new Log({ parentLog: log }).span.name, "parent", "a child inherits spanName");
	t.deepEqual(new Log({ context: { baz: "fu" }, parentLog: log }).context, { baz: "fu" }, "a child's context replaces its parent's");

	t.strictEqual(JSON.stringify(log.clone({ context: { baz: "fu" } }).context), "{\"foo\":\"bar\",\"baz\":\"fu\"}", "new keys merge in");
	t.strictEqual(JSON.stringify(log.clone({ context: { foo: "burp" } }).context), "{\"foo\":\"burp\"}", "existing keys are overridden");
	t.strictEqual(JSON.stringify(log.clone({ context: { foo: undefined } }).context), "{\"foo\":\"bar\"}", "an undefined override is dropped, not applied");

	const holed = new Log({ context: { foo: "bar" }, stdout: () => {} });

	(holed.context as Record<string, unknown>).gone = undefined;
	t.deepEqual(Object.keys(holed.clone().conf.context ?? {}), ["foo"], "a key the source's context holds as undefined is dropped too");
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
	t.doesNotThrow(() => new Log({ otlpHttpBaseURI: "http://127.0.0.1:4318" }), "valid uri does not throw");
	t.end();
});

for (const uri of ["http://u:s3cr3t/w@127.0.0.1:4318", "otlp:u:s3cr3t@127.0.0.1:4318"]) {
	test(`the error a malformed ${uri.slice(0, 5)} otlpHttpBaseURI throws carries no part of the URI`, t => {
		let caught: unknown;

		try {
			new Log({ otlpHttpBaseURI: uri });
		} catch (err) {
			caught = err;
		}

		t.notOk(JSON.stringify(caught, Object.getOwnPropertyNames(caught as object)).includes("s3cr3t"), "cause and input included");
		t.end();
	});
}

test("the constructor and clone copy the caller's options object instead of filling it", t => {
	const conf: LogConf = { context: { service: "x" }, format: "json" };
	const parent = new Log(conf);
	const childConf: LogConf = { parentLog: parent };

	new Log(childConf);
	parent.clone(conf);
	t.deepEqual(conf, { context: { service: "x" }, format: "json" }, "no default, inherited setting or formatter is written into it");
	t.deepEqual(Object.keys(childConf), ["parentLog"], "nothing inherited from the parent is written into a child's");
	t.strictEqual(parent.conf.logLevel, "info", "the instance still resolves its defaults");
	t.notOk(Object.values(new Log({ parentLog: parent }).conf).some(value => value === undefined), "a child's conf holds no key its parent lacked");
	t.notOk(Object.values(parent.clone().conf).some(value => value === undefined), "nor does a clone's");
	t.end();
});

test("log.conf.context reads back at its v2.3.0 type, its undefined keys dropped before the conf is built", t => {
	const options: LogOptions = { context: { port: undefined, service: "x" }, stderr: () => {} };
	const log: LogInt = new Log(options);
	// Typed, not inferred: widening LogConf["context"] to MetadataInput again fails the build here.
	const read: Metadata | undefined = log.conf.context;

	t.deepEqual(read, { service: "x" }, "the constructor drops the undefined key");
	t.deepEqual(new Log(options).clone({ context: { region: undefined, zone: "y" } }).conf.context, { service: "x", zone: "y" }, "so does clone, after merging");
	t.deepEqual(new Log({ parentLog: log }).conf.context, { service: "x" }, "a child inherits the dropped copy");
	t.deepEqual(options.context, { port: undefined, service: "x" }, "the caller's context object is left as given");
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
	t.strictEqual(log.conf.format, "json", "and format reads back as written, as in v2.3.0");
	t.strictEqual(stderr.length, 1, "one warning per sink");
	t.strictEqual(stderr[0], "custom @larvit/log: entryFormatter is deprecated and removed in 3.0.0, use format — entryFormatter wins and the format beside it is ignored", "the warning goes through the instance's formatter, names the spelling to use instead and says which of the two wins");
	log.info("again");
	t.strictEqual(stderr.length, 1, "a second entry on the same sink stays quiet");

	const cloneStderr: string[] = [];
	const clone = log.clone({ stderr: line => { cloneStderr.push(line); } });

	clone.info("cloned");
	t.deepEqual(cloneStderr, [], "a clone inherits the formatter without repeating the warning on its own sink");
	t.strictEqual(stdout[stdout.length - 1], "custom cloned", "the clone kept the inherited formatter");
	t.strictEqual(clone.conf.format, "json", "and reads back the format beside it, as in v2.3.0");

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

	const deprecated = capture({ entryFormatter: own });
	const resolved: ResolvedLogConf = { ...deprecated.log.conf };

	t.strictEqual(deprecated.log.conf.entryFormatter, own, "a resolved conf reads the formatter back from entryFormatter, whichever spelling set it");
	t.deepEqual(Object.keys(deprecated.log.conf).filter(key => key === "entryFormatter"), [], "the deprecated name is not a key of its own, so nothing inherits or spreads it");
	t.strictEqual(resolved.entryFormatter, undefined, "and a spread of a resolved conf never carries it, so nothing folds a second time");

	const given: LogConf = { entryFormatter: own, stderr: () => {} };

	new Log(given);
	t.strictEqual(given.entryFormatter, own, "the caller's own options object keeps the spelling they wrote");
	t.end();
});

test("resolveFormatter hands back the formatter a conf writes with", t => {
	const own = (entry: EntryFormatterConf) => `own ${entry.msg}`;

	t.strictEqual(resolveFormatter(new Log({ format: own }).conf), own, "a function format, which conf.format cannot hold before 3.0.0");
	t.strictEqual(resolveFormatter(new Log({ format: "json" }).conf), msgJsonFormatter, "json");
	t.strictEqual(resolveFormatter(new Log().conf), msgTextFormatter, "text by default");
	t.strictEqual(resolveFormatter(new Log(null as never).conf), msgTextFormatter, "and with null for options, as untyped code may pass");
	t.strictEqual(resolveFormatter({ entryFormatter: own, format: "json" }), own, "a hand-built conf's entryFormatter, which wins over its format as on a Log");
	t.end();
});

test("conf.entryFormatter reads and writes the formatter until 3.0.0", t => {
	const readback = capture({ format: "json" });

	// Typed, not inferred: dropping the member from ResolvedLogConf again fails the build here.
	const fromPublishedType: EntryFormatter = readback.log.conf.entryFormatter;

	t.strictEqual(fromPublishedType, msgJsonFormatter, "reading it resolves format, as it did in v2.3.0 whichever spelling set the formatter, and off the published type too");
	t.deepEqual(readback.stderr, [], "and warns about nothing: conf.format cannot hold a function before 3.0.0");

	const swap = capture({ colors: false });
	const swapped = (entry: EntryFormatterConf) => `swapped ${entry.msg}`;

	swap.log.conf.entryFormatter = swapped;
	swap.log.info("hi");
	t.strictEqual(swap.stdout[0], "swapped hi", "writing it swaps the formatter on a live instance, as it did in v2.3.0");
	t.strictEqual(swap.log.conf.format, "text", "and leaves format as it was, as in v2.3.0");
	t.strictEqual(swap.log.conf.entryFormatter, swapped, "a read after a write resolves what was written");
	t.deepEqual(swap.stderr, [], "and warns about nothing");
	swap.log.conf.format = "json";
	swap.log.info("still");
	t.strictEqual(swap.stdout[1], "swapped still", "a function formatter wins over a format written after it");

	const live = capture({ format: "text" });

	live.log.conf.format = "json";
	live.log.info("live");
	t.strictEqual(JSON.parse(live.stdout[0]).msg, "live", "format is read where a line is written, like logLevel and the sinks");

	const liveChild = new Log({ parentLog: live.log });

	liveChild.conf.format = "text";
	liveChild.info("child");
	t.ok(live.stdout[1].endsWith("child"), "a child of a Log with a built-in formatter follows its own format, since the parent has no function formatter to hand it");

	new Log(swap.log.conf).info("from conf");
	t.strictEqual(swap.stdout[2], "swapped from conf", "a Log built from another Log's conf object takes that Log's function formatter, as through 2.5.0");

	// Only a hand-written LogInt's conf carries the deprecated name as a key of its own.
	const handBuilt = capture({ format: (entry: EntryFormatterConf) => `parent ${entry.msg}` });

	Object.defineProperty(handBuilt.log.conf, "entryFormatter", { configurable: true, enumerable: true, value: () => "inherited" });
	new Log({ parentLog: handBuilt.log }).info("hi");
	t.deepEqual(handBuilt.stdout, ["parent hi"], "a formatter this module stored wins over the conf's own entryFormatter key");
	t.deepEqual(handBuilt.stderr, [], "and warns about nothing: the app developer never wrote that spelling");

	// What a parent built by another copy of this module, or a v2.3.0 LogInt, hands a child.
	const foreign = new Log();
	const foreignConf: LogConf = { entryFormatter: entry => `foreign ${entry.msg}`, format: "json" };

	Object.defineProperty(foreign, "conf", { value: foreignConf });
	const foreignChild = capture({ parentLog: foreign });

	foreignChild.log.info("hi");
	t.deepEqual(foreignChild.stdout, ["foreign hi"], "a parent's formatter this module did not store is inherited through its entryFormatter, which wins over its format");
	t.strictEqual(foreignChild.log.conf.format, "json", "and the format beside it reads back on the child");
	t.deepEqual(foreignChild.stderr, [], "and warns about nothing");
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

test("end() on an ended log rejects", async t => {
	const { log } = capture();

	await log.end();
	t.strictEqual(await log.end().then(() => "", (err: unknown) => String(err)), "Error: Logging instance is already ended", "the second end() rejects, naming why");
	t.end();
});

test("a level method on an ended log throws", async t => {
	const { log } = capture();

	await log.end();
	t.strictEqual(thrown(() => { log.info("x"); }), "Error: Logging instance is already ended", "logging after end() throws, naming why");
	t.end();
});
