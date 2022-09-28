import test from "tape";

import { Log } from "./index.js";

test("Should log to info.", t => {
	const oldStdout = process.stdout.write;
	const log = new Log();

	let outputMsg = "";

	process.stdout.write = msg => outputMsg = msg;

	log.info("flurp");

	process.stdout.write = oldStdout;

	t.strictEqual(
		outputMsg.substring(19),
		"Z [\u001b[1;32minf\u001b[0m] flurp\n",
		"Should detect \"flurp\" in the output of the inf log",
	);

	t.end();
});

test("Should log to error.", t => {
	const oldStderr = process.stderr.write;
	const log = new Log();

	let outputMsg = "";

	process.stderr.write = msg => outputMsg = msg;

	log.error("burp");

	process.stderr.write = oldStderr;

	t.strictEqual(
		outputMsg.substring(19),
		"Z [\u001b[1;31merr\u001b[0m] burp\n",
		"Should detect \"burp\" in the output of the err log",
	);

	t.end();
});

test("Should not print debug by default.", t => {
	const oldStdout = process.stdout.write;
	const log = new Log();

	let outputMsg = "yay";

	process.stdout.write = msg => outputMsg = msg;

	log.debug("nai");

	process.stdout.write = oldStdout;

	t.strictEqual(outputMsg, "yay", "Should get \"yay\" since the outputMsg should not be replaced");

	t.end();
});

test("Should print debug when given \"silly\" as level.", t => {
	const oldStdout = process.stdout.write;
	const log = new Log("silly");

	let outputMsg = "woof";

	process.stdout.write = msg => outputMsg = msg;

	log.debug("wapp");

	process.stdout.write = oldStdout;

	t.strictEqual(outputMsg.substring(19), "Z [\u001b[1;35mdeb\u001b[0m] wapp\n", "Should obtain \"wapp\" from the deb log");

	t.end();
});

test("Print nothing, even on error, when no valid level is set.", t => {
	const oldStderr = process.stderr.write;
	let outputMsg = "SOMETHING";
	const log = new Log("none");

	process.stderr.write = msg => outputMsg = msg;
	log.error("kattbajs");
	process.stderr.write = oldStderr;
	t.strictEqual(outputMsg.substring(19), "", "Nothing should be written without an error log level");
	t.end();
});

test("Test silly.", t => {
	const oldStdout = process.stdout.write;
	let outputMsg = "";
	const log = new Log("silly");

	process.stdout.write = msg => outputMsg = msg;
	log.silly("kattbajs");
	process.stdout.write = oldStdout;
	t.strictEqual(outputMsg.substring(19), "Z [\x1b[1;37msil\x1b[0m] kattbajs\n", "Should obtain \"kattbajs\" from the outputMsg");
	t.end();
});

test("Test debug", t => {
	const oldStdout = process.stdout.write;
	let outputMsg = "";
	const log = new Log("debug");

	process.stdout.write = msg => outputMsg = msg;
	log.debug("kattbajs");
	process.stdout.write = oldStdout;
	t.strictEqual(outputMsg.substring(19), "Z [\x1b[1;35mdeb\x1b[0m] kattbajs\n", "");
	t.end();
});

test("Test verbose", t => {
	const oldStdout = process.stdout.write;
	let outputMsg = "";
	const log = new Log("verbose");

	process.stdout.write = msg => outputMsg = msg;
	log.verbose("kattbajs");
	process.stdout.write = oldStdout;
	t.strictEqual(outputMsg.substring(19), "Z [\x1b[1;34mver\x1b[0m] kattbajs\n");
	t.end();
});

test("Test info", t => {
	const oldStdout = process.stdout.write;
	let outputMsg = "";
	const log = new Log("info");

	process.stdout.write = msg => outputMsg = msg;
	log.info("kattbajs");
	process.stdout.write = oldStdout;
	t.strictEqual(outputMsg.substring(19), "Z [\x1b[1;32minf\x1b[0m] kattbajs\n");
	t.end();
});

test("Test warn", t => {
	const oldStderr = process.stderr.write;
	let outputMsg = "";
	const log = new Log("warn");

	process.stderr.write = msg => outputMsg = msg;
	log.warn("kattbajs");
	process.stderr.write = oldStderr;
	t.strictEqual(outputMsg.substring(19), "Z [\x1b[1;33mwar\x1b[0m] kattbajs\n");
	t.end();
});

test("Test error", t => {
	const oldStderr = process.stderr.write;
	let outputMsg = "";
	const log = new Log("silly");

	process.stderr.write = msg => outputMsg = msg;
	log.error("kattbajs");
	process.stderr.write = oldStderr;
	t.strictEqual(outputMsg.substring(19), "Z [\x1b[1;31merr\x1b[0m] kattbajs\n");
	t.end();
});

test("Test initializing with options object", t => {
	const oldStderr = process.stderr.write;
	let outputMsg = "";
	const log = new Log({ logLevel: "error" });

	process.stderr.write = msg => outputMsg = msg;
	log.error("an error");
	process.stderr.write = oldStderr;
	t.strictEqual(outputMsg.substring(19), "Z [\x1b[1;31merr\x1b[0m] an error\n");
	t.end();
});

test("Default level is info if nothing else is specified", t => {
	const oldStdout = process.stdout.write;
	let outputMsg = "";
	const log = new Log({ logLevel: undefined });

	process.stdout.write = msg => outputMsg = msg;
	log.info("information");
	process.stdout.write = oldStdout;
	t.ok(outputMsg.includes(" information"));
	process.stdout.write = msg => outputMsg = msg;
	log.verbose("not logged");
	process.stdout.write = oldStdout;
	t.notOk(outputMsg.includes(" not logged"));
	t.end();
});

test("Test only errors are logged if log level is error", t => {
	const oldStdout = process.stdout.write;
	const oldStderr = process.stderr.write;
	let outputMsg = "";
	const log = new Log("error");

	process.stdout.write = msg => outputMsg = msg;
	log.silly("kattbajs");
	process.stdout.write = oldStdout;
	t.strictEqual(outputMsg.length, 0, "Log level \"silly\" should not be logged");

	process.stdout.write = msg => outputMsg = msg;
	log.debug("kattbajs");
	process.stdout.write = oldStdout;
	t.strictEqual(outputMsg.length, 0, "Log level \"debug\" should not be logged");

	process.stdout.write = msg => outputMsg = msg;
	log.verbose("kattbajs");
	process.stdout.write = oldStdout;
	t.strictEqual(outputMsg.length, 0, "Log level \"verbose\" should not be logged");

	process.stderr.write = msg => outputMsg = msg;
	log.warn("kattbajs");
	process.stderr.write = oldStderr;
	t.strictEqual(outputMsg.length, 0, "Log level \"warn\" should not be logged");

	process.stderr.write = msg => outputMsg = msg;
	log.error("kattbajs");
	process.stderr.write = oldStderr;
	t.ok(outputMsg.includes(" kattbajs"), "Log level \"error\" should be logged");
	t.end();
});

test("Test with metadata", t => {
	const oldStdout = process.stdout.write;
	let outputMsg = "";
	const log = new Log("info");

	process.stdout.write = msg => outputMsg = msg;
	log.info("kattbajs", { foo: "bar" });
	process.stdout.write = oldStdout;
	t.strictEqual(outputMsg.split(" kattbajs ")[1].trim(), "{\"foo\":\"bar\"}", "Metadata should be included in output");
	t.end();
});

test("Test with context", t => {
	const oldStdout = process.stdout.write;
	let outputMsg = "";
	const log = new Log({ context: { bosse: "bäng", hasse: "luring" } });

	process.stdout.write = msg => outputMsg = msg;
	log.info("kattbajs", { foo: "bar" });
	process.stdout.write = oldStdout;
	t.strictEqual(
		outputMsg.split(" kattbajs ")[1].trim(),
		"{\"foo\":\"bar\",\"bosse\":\"bäng\",\"hasse\":\"luring\"}",
		"Metadata and context should be included in output",
	);
	t.end();
});

test("Json stringifyer", t => {
	const oldStdout = process.stdout.write;
	let outputMsg = "";
	const log = new Log({ context: { hello: "yo" }, format: "json" });

	process.stdout.write = msg => outputMsg = msg;
	log.info("bosse", { foo: "frasse" });
	const parsed = JSON.parse(outputMsg);

	process.stdout.write = oldStdout;
	t.strictEqual(parsed.foo, "frasse", "Metadata foo should be \"frasse\"");
	t.strictEqual(parsed.hello, "yo", "Context should be in the json");
	t.strictEqual(parsed.logLevel, "info", "logLevel should be set");
	t.strictEqual(parsed.msg, "bosse", "msg should be set to \"bosse\"");

	t.end();
});
