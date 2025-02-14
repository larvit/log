import express from "express";
import { Server } from "http";
import { AddressInfo } from "net";
import test from "tape";

import { Log } from "./index.js";

function isNanoTimestampWithinHour(str) {
	if (!/^\d+$/.test(str)) {
		return false;
	}

	// nanosecond to second
	const unixTimestamp = Math.round(parseInt(str) / 1000000000);

	// millisecond to second
	const now = Math.floor(Date.now() / 1000);

	const hourInSeconds = 3600;

	// Check if number is a reasonable Unix timestamp (after 2020)
	if (unixTimestamp > 1577836800) { // 2020-01-01
		const difference = Math.abs(now - unixTimestamp);

		return difference <= hourInSeconds;
	}

	return false;
}

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

test("Copy instance", t => {
	const log = new Log({ context: { foo: "bar" } });
	const newLog = log.clone({ context: { baz: "fu" }, logLevel: "error" });
	const newLog2 = log.clone({ context: { foo: "burp" } });

	t.strictEqual(JSON.stringify(newLog.context), "{\"foo\":\"bar\",\"baz\":\"fu\"}", "Context is merged in newLog.");
	t.strictEqual(JSON.stringify(newLog2.context), "{\"foo\":\"burp\"}", "Context is merged in newLog2.");

	t.end();
});

test("OLTP simple log", t => {
	const mockExpress = express();
	let calls = 0;
	let mockServer = null as unknown as Server;
	let traceId = "";

	mockExpress.use(express.json());

	mockExpress.post("*name", (req, res) => {
		calls++;

		if (req.path === "/v1/logs") {
			t.strictEqual(req.body.resourceLogs.length, 1, "Exactly one resourceLog in /v1/logs body");
			t.strictEqual(req.body.resourceLogs[0].scopeLogs.length, 1, "Exactly one scopeLog in /v1/logs body");
			t.strictEqual(req.body.resourceLogs[0].scopeLogs[0].logRecords.length, 1, "Exactly one logRecord in /v1/logs body");

			const logRecord = req.body.resourceLogs[0].scopeLogs[0].logRecords[0];

			t.strictEqual(logRecord.body.stringValue, "Gir in da house!", "logRecord.body is correct");
			t.strictEqual(logRecord.severityNumber, 17, "logRecord.severityNumber is correct");
			t.strictEqual(logRecord.severityText, "ERROR", "logRecord.severityText is correct");
			t.notStrictEqual(logRecord.traceId.length, 0, "logRecord.traceId has a non-zero length");

			t.ok(isNanoTimestampWithinHour(logRecord.timeUnixNano), "timeUnixNano is reasonable");

			traceId = logRecord.traceId;
		} else if (req.path === "/v1/traces") {
			t.strictEqual(req.body.resourceSpans.length, 1, "Exactly one resourceSpan in /v1/traces body");
			t.strictEqual(req.body.resourceSpans[0].scopeSpans.length, 1, "Exactly one scopeSpan in /v1/traces body");
			t.strictEqual(req.body.resourceSpans[0].scopeSpans[0].spans.length, 1, "Exactly one span in /v1/traces body");

			const span = req.body.resourceSpans[0].scopeSpans[0].spans[0];

			t.strictEqual(typeof span.endTimeUnixNano, "string", "span.endTimeUnixNano is a string");
			t.strictEqual(span.kind, 1, "Span kind is always 1");
			t.strictEqual(typeof span.startTimeUnixNano, "string", "span.startTimeUnixNano is a string");

			t.strictEqual(typeof span.name, "string", "span.name is a string");
			t.notStrictEqual(span.name.length, 0, "span.name has a non-zero length");

			t.strictEqual(typeof span.spanId, "string", "span.spanId is a string");
			t.notStrictEqual(span.spanId.length, 0, "span.spanId has a non-zero length");

			t.strictEqual(typeof span.traceId, "string", "span.traceId is a string");
			t.notStrictEqual(span.traceId.length, 0, "span.traceId has a non-zero length");
			t.strictEqual(span.traceId, traceId, "span.traceId is correct");

			t.ok(isNanoTimestampWithinHour(span.endTimeUnixNano), "span.endTimeUnixNano is reasonable");
			t.ok(isNanoTimestampWithinHour(span.startTimeUnixNano), "span.startTimeUnixNano is reasonable");
		} else {
			t.fail(`Unexpected call: ${req.path}`);
		}

		res.json({ partialSuccess: {} });

		if (calls === 2) {
			mockServer.close();
			t.end();
		}
	});

	mockServer = mockExpress.listen(0, "127.0.0.1", () => {
		const { port } = mockServer.address() as AddressInfo;
		const oldStderr = process.stderr.write;
		const log = new Log({
			otlpExportTimeoutMillis: 50, // default: 3000, How long to wait for the export to complete
			otlpHttpBaseURI: `http://127.0.0.1:${port}`,
			otlpMaxExportBatchSize: 5, // default: 512, Maximum number of spans to batch
			otlpMaxQueueSize: 32, // default: 2048, Maximum queue size (default 2048)
			otlpScheduledDelayMillis: 10, // default: 100, How often to check for spans to send (default 1000ms)
		});

		process.stderr.write = () => true;
		log.error("Gir in da house!");
		process.stderr.write = oldStderr;
		log.end();
	});
});

test("OLTP simple log with metadata", t => {
	const mockExpress = express();
	let calls = 0;
	let mockServer = null as unknown as Server;

	mockExpress.use(express.json());

	mockExpress.post("*name", (req, res) => {
		calls++;

		if (req.path === "/v1/logs") {
			const logRecord = req.body.resourceLogs[0].scopeLogs[0].logRecords[0];

			t.strictEqual(logRecord.body.stringValue, "FOo", "logRecord.body is correct");
			t.strictEqual(logRecord.severityNumber, 13, "logRecord.severityNumber is correct");
			t.strictEqual(logRecord.severityText, "WARN", "logRecord.severityText is correct");

			t.strictEqual(logRecord.attributes[0].key, "bar", "First attribute is bar");
			t.strictEqual(logRecord.attributes[0].value.stringValue, "baz", "First attribute value is baz");
			t.strictEqual(logRecord.attributes[1].key, "lökig knasnyckel | typ", "Second attribute is \"lökig knasnyckel | typ\"");
			t.strictEqual(logRecord.attributes[1].value.stringValue, "17", "Second attribute value is \"17\"");
		} else if (req.path === "/v1/traces") {
			t.comment("/v1/traces was called");
		} else {
			t.fail(`Unexpected call: ${req.path}`);
		}

		res.json({ partialSuccess: {} });

		if (calls === 2) {
			mockServer.close();
			t.end();
		}
	});

	mockServer = mockExpress.listen(0, "127.0.0.1", () => {
		const { port } = mockServer.address() as AddressInfo;
		const oldStderr = process.stderr.write;
		const log = new Log({
			otlpExportTimeoutMillis: 50, // default: 3000, How long to wait for the export to complete
			otlpHttpBaseURI: `http://127.0.0.1:${port}`,
			otlpMaxExportBatchSize: 5, // default: 512, Maximum number of spans to batch
			otlpMaxQueueSize: 32, // default: 2048, Maximum queue size (default 2048)
			otlpScheduledDelayMillis: 10, // default: 100, How often to check for spans to send (default 1000ms)
		});

		process.stderr.write = () => true;
		log.warn("FOo", { bar: "baz", "lökig knasnyckel | typ": "17" });
		log.end();
		process.stderr.write = oldStderr;
	});
});

test("OLTP multiple instances should work independently", t => {
	const mockExpress = express();
	let calls = 0;
	let mockServer = null as unknown as Server;

	mockExpress.use(express.json());

	mockExpress.post("*name", (req, res) => {
		calls++;

		if (req.path === "/v1/logs") {
			const logRecord = req.body.resourceLogs[0].scopeLogs[0].logRecords[0];

			const serviceName = logRecord.attributes.find((attribute: any) => attribute.key === "service.name").value.stringValue;

			if (logRecord.body.stringValue === "rappakalja") {
				t.strictEqual(serviceName, "log1", "serviceName for rappakalja should be log1.");
			} else if (logRecord.body.stringValue === "bollhav") {
				t.strictEqual(serviceName, "log2", "serviceaName for bollhav should be log2.");
			} else {
				t.fail(`Unexpected log body: "${logRecord.body.stringValue}"`);
			}
		} else if (req.path === "/v1/traces") {
			t.comment("/v1/traces was called");
		} else {
			t.fail(`Unexpected call: ${req.path}`);
		}

		res.json({ partialSuccess: {} });

		if (calls === 4) {
			mockServer.close();
			t.end();
		}
	});

	mockServer = mockExpress.listen(0, "127.0.0.1", () => {
		const { port } = mockServer.address() as AddressInfo;
		const oldStderr = process.stderr.write;

		const otlpOptions = {
			otlpExportTimeoutMillis: 50, // default: 3000, How long to wait for the export to complete
			otlpHttpBaseURI: `http://127.0.0.1:${port}`,
			otlpMaxExportBatchSize: 5, // default: 512, Maximum number of spans to batch
			otlpMaxQueueSize: 32, // default: 2048, Maximum queue size (default 2048)
			otlpScheduledDelayMillis: 10, // default: 100, How often to check for spans to send (default 1000ms)
		};

		process.stderr.write = () => true;

		// Create a first log instance
		const log1 = new Log({
			context: {
				"service.name": "log1",
			},
			...otlpOptions,
		});

		log1.warn("rappakalja");
		log1.end();

		// Create a second, that should now be independent
		const log2 = new Log({
			context: {
				"service.name": "log2",
			},
			...otlpOptions,
		});

		log2.warn("bollhav");
		log2.end();
		process.stderr.write = oldStderr;
	});
});
