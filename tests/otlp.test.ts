import { type Clock, Log, type Metadata, type OtlpPayload, type OtlpQueue, Queue, type QueueStorage, type TimerHandle } from "../index.js";
import { unref } from "../otlp/export-scheduler.js";
import { encodeBatch, plainHttpWarnings, statusFailure } from "../otlp/sender.js";
import { pbDecode, pbDecodeLogs, pbDecodeSpans, pbMsg } from "./protobuf-decode.js";
import test from "./tap.js";
import { callHeader, exportedRecords, exportedSpans, fakeClock, fakeStorage, nanos, reportSink, response, storedRecords, stubFetch, thrown, waitFor } from "./test-doubles.js";

test("a transient export failure keeps the batch queued, reports one line and the retry delivers it", async t => {
	stubFetch(() => { throw new Error("connection refused"); });
	const clock = fakeClock();
	const stderr: string[] = [];
	const log = new Log({ otlpQueue: new Queue({ clock, otlpHttpBaseURI: "http://127.0.0.1:1", report: (msg, metadata) => stderr.push(`${msg} ${JSON.stringify(metadata)}`), retryDelayMs: 20 }), stderr: () => {} });

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
	await clock.advance(20);
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

for (const status of [401, 403]) {
	test(`a ${status} export reports unauthorized once and drops the batch without a retry`, async t => {
		const { calls } = stubFetch(() => response({ status }));
		const sink = reportSink();
		const log = new Log({ otlpQueue: new Queue({ otlpHttpBaseURI: "http://127.0.0.1:4318", report: sink.report }), stderr: () => {} });

		log.info("x");
		await log.flush();
		await log.flush();
		t.deepEqual(sink.lines.map(line => [line.msg, line.status]), [["OTLP export unauthorized, batch dropped", status]], "reported once, as unauthorized");
		t.strictEqual(calls.length, 1, "never retried");
		t.end();
	});
}

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

test("user:pass@ in otlpHttpBaseURI beside an Authorization in otlpAdditionalHeaders warns once per report sink, and the header goes", async t => {
	const { calls } = stubFetch();
	const warning = "@larvit/log: otlpHttpBaseURI carries user:pass@ and otlpAdditionalHeaders sets Authorization, so the otlpAdditionalHeaders one is sent and the userinfo is not; set one of them, as 3.0.0 throws on both";
	const sink = reportSink();
	const both = { otlpAdditionalHeaders: { authorization: "Bearer t0ken" }, otlpHttpBaseURI: "https://collector:s3cret@collector.test", report: sink.report };

	new Queue(both);

	const queue = new Queue(both);
	const log = new Log({ otlpQueue: queue, stderr: () => {} });

	log.info("x");
	await log.flush();
	t.deepEqual(sink.lines, [{ msg: warning }], "warns once per sink, never naming a credential");
	t.strictEqual(callHeader(calls[0], "Authorization"), "Bearer t0ken", "the header wins, as in v2.4.0");

	const single = reportSink();

	new Queue({ otlpHttpBaseURI: "https://collector:s3cret@collector.test", report: single.report });
	new Queue({ otlpAdditionalHeaders: { Authorization: "Bearer t0ken" }, otlpHttpBaseURI: "https://collector.test", report: single.report });
	t.deepEqual(single.lines, [], "either spelling alone is silent");

	const stderr: string[] = [];
	const toStderr = (line: string) => { stderr.push(line); };

	for (let i = 0; i < 2; i++) {
		new Log({ format: "json", otlpAdditionalHeaders: { Authorization: "Bearer t0ken" }, otlpHttpBaseURI: "https://collector:s3cret@collector.test", stderr: toStderr });
	}

	t.deepEqual(stderr.map(line => [JSON.parse(line).logLevel, JSON.parse(line).msg]), [["warn", warning]], "a Log-built queue warns once per stderr, at warn");
	t.end();
});

for (const conf of [
	{ otlpHttpBaseURI: "https://u:p@collector.test" },
	{ otlpHttpBaseURI: "http://u:p@localhost:4318" },
	{ otlpHttpBaseURI: "http://u:p@127.8.9.10" },
	{ otlpHttpBaseURI: "http://u:p@[::1]:4318" },
	{ acceptPlainHttpCredentials: true, otlpHttpBaseURI: "http://u:p@collector.test:4318" },
]) {
	test(`credentials sent to ${JSON.stringify(conf)} raise no plain-http warning`, async t => {
		stubFetch();
		const quiet = reportSink();
		const log = new Log({ otlpQueue: new Queue({ ...conf, report: quiet.report }), stderr: () => {} });

		log.info("x");
		await log.flush();
		t.deepEqual(quiet.lines, [], "https:, a loopback host and acceptPlainHttpCredentials are silent");
		t.end();
	});
}

test("an Authorization sent over plain http: to a non-loopback host warns once per report sink, and still goes", async t => {
	const { calls } = stubFetch();
	const warning = (source: string, header = "authorization") => `@larvit/log: the ${header} header from ${source} goes over plain http: to collector.test:4318, readable by anything on the network path; use an https: endpoint, or on a network you trust set acceptPlainHttpCredentials: true on the Queue`;
	const send = async (queue: Queue) => {
		const log = new Log({ otlpQueue: queue, stderr: () => {} });

		log.info("x");
		await log.flush();
	};
	const sink = reportSink();
	const header = reportSink();
	const headers: Record<string, string> = {};
	const queue = new Queue({ otlpAdditionalHeaders: headers, otlpHttpBaseURI: "http://collector.test:4318", report: header.report });

	await send(new Queue({ otlpHttpBaseURI: "http://collector:s3cret@collector.test:4318", report: sink.report }));
	await send(new Queue({ otlpHttpBaseURI: "http://collector:s3cret@collector.test:4318", report: sink.report }));
	t.deepEqual(sink.lines, [{ msg: warning("user:pass@ in otlpHttpBaseURI") }], "userinfo warns once per sink, naming the host and never the credential");

	await send(queue);
	t.deepEqual(header.lines, [], "no Authorization, no warning");
	headers.authorization = "Bearer t0ken";
	await send(queue);
	t.deepEqual(header.lines, [{ msg: warning("otlpAdditionalHeaders") }], "an Authorization header set after construction warns, whatever its casing");

	const lookalike = reportSink();

	await send(new Queue({ otlpHttpBaseURI: "http://u:p@127.evil.test", report: lookalike.report }));
	t.strictEqual(lookalike.lines.length, 1, "a name starting 127. is no loopback address");

	const stringly = reportSink();
	const unset = new Queue({ otlpHttpBaseURI: "http://u:p@other.test", report: stringly.report });

	await send(Reflect.construct(Queue, [{ acceptPlainHttpCredentials: "false", otlpHttpBaseURI: "http://u:p@other.test", report: stringly.report }]));
	t.strictEqual(stringly.lines.length, 1, "only true accepts, never a truthy string");
	t.strictEqual(unset.conf.acceptPlainHttpCredentials, false, "it reads back false when unset");

	let unwarned = "";

	try {
		await send(Reflect.construct(Queue, [{ otlpHttpBaseURI: "http://u:p@collector.test:4318", report: "not a function" }]));
	} catch (err) {
		unwarned = String(err);
	}

	t.strictEqual(unwarned, "", "a report that is no function never throws");

	const stderr: string[] = [];
	const toStderr = (line: string) => { stderr.push(line); };

	for (const msg of ["x", "y"]) {
		const log = new Log({ format: "json", otlpHttpBaseURI: "http://collector:s3cret@collector.test:4318", stderr: toStderr });

		log.info(msg);
		await log.flush();
	}

	const { logLevel, msg } = JSON.parse(stderr[0]);

	t.deepEqual({ lines: stderr.length, logLevel, msg }, { lines: 1, logLevel: "warn", msg: warning("user:pass@ in otlpHttpBaseURI") }, "a Log-built queue warns once per stderr, at warn");

	const broken = new Log({ otlpHttpBaseURI: "http://collector:s3cret@collector.test:4318", stderr: () => { throw new Error("stderr closed"); } });

	broken.info("z");
	t.strictEqual(await broken.flush().then(() => "", err => String(err)), "", "a stderr that throws on the warning never rejects flush()");
	t.strictEqual(calls.length, 10, "every request still goes");
	t.end();
});

test("every credential header over plain http: warns once, and acceptPlainHttpCredentials silences them all", async t => {
	const { calls } = stubFetch();
	const warning = (header: string) => `@larvit/log: the ${header} header from otlpAdditionalHeaders goes over plain http: to collector.test:4318, readable by anything on the network path; use an https: endpoint, or on a network you trust set acceptPlainHttpCredentials: true on the Queue`;
	const send = async (queue: Queue) => {
		const log = new Log({ otlpQueue: queue, stderr: () => {} });

		log.info("x");
		log.info("y");
		await log.flush();
	};
	const otlpHttpBaseURI = "http://collector.test:4318";
	const loud = reportSink();

	await send(new Queue({ otlpAdditionalHeaders: { "Api-Key": "k", "X-Auth-Token": "t", "X-Trace": "harmless" }, otlpHttpBaseURI, report: loud.report }));
	t.deepEqual(loud.lines.map(line => line.msg).sort(), [warning("api-key"), warning("x-auth-token")], "one line per credential header, by its name and never its value, none for a plain one");

	const quiet = reportSink();

	await send(new Queue({ acceptPlainHttpCredentials: true, otlpAdditionalHeaders: { "api-key": "k" }, otlpHttpBaseURI, report: quiet.report }));
	t.deepEqual(quiet.lines, [], "acceptPlainHttpCredentials silences a header other than Authorization");

	const loopback = reportSink();

	await send(new Queue({ otlpAdditionalHeaders: { "api-key": "k" }, otlpHttpBaseURI: "http://localhost:4318", report: loopback.report }));
	await send(new Queue({ otlpAdditionalHeaders: { "api-key": "k" }, otlpHttpBaseURI: "https://collector.test", report: loopback.report }));
	t.deepEqual(loopback.lines, [], "a loopback host and https: stay silent");

	t.strictEqual(calls.length, 4, "every request still goes");
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
	const invalid = new Log({ otlpQueue: new Queue({ otlpAdditionalHeaders: { "X-Bad": "s3\ncr3t" }, otlpHttpBaseURI: "http://127.0.0.1:4318", report: reports.report }), stderr: () => {} });

	invalid.info("z");
	await invalid.flush();
	t.strictEqual(calls.length, 2, "nothing is sent with a header the runtime rejects");
	t.deepEqual(reports.lines, [{ error: "otlpAdditionalHeaders carries an invalid X-Bad header", items: 1, msg: "OTLP export headers invalid, batch dropped", path: "/v1/logs", url: "http://127.0.0.1:4318/v1/logs" }], "the batch is dropped under its own message, naming the header but never its value");
	t.notOk(JSON.stringify(reports.lines).includes("s3cr3t"), "the rejected header value is not reported");

	// A whole header line pasted as a name holds the token, so only its position is reported.
	const pastedReports = reportSink();
	const pasted = new Log({ otlpQueue: new Queue({ otlpAdditionalHeaders: { "Authorization: Bearer s3cr3t": "", "X-Ok": "a" }, otlpHttpBaseURI: "http://127.0.0.1:4318", report: pastedReports.report }), stderr: () => {} });

	pasted.info("z");
	await pasted.flush();
	t.deepEqual(pastedReports.lines.map(line => line.error), ["otlpAdditionalHeaders carries an invalid header name at position 1 (counting from 1)"], "a name that is no RFC 9110 token is reported by its position");
	t.notOk(JSON.stringify(pastedReports.lines).includes("s3cr3t"), "the pasted token stays out of the report");
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
	const sized = new Log({ clock, otlpQueue: new Queue({ batchDelayMs: 10000, clock, maxBatchBytes: 3000, otlpHttpBaseURI: "http://127.0.0.1:4318" }), stderr: () => {} });

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

// The payload a record of this text makes, as the queue is handed it, and the bytes it counts for.
function recordPayload(text: string): { bytes: number, payload: OtlpPayload } {
	let payload: OtlpPayload | undefined;
	const log = new Log({ clock: fakeClock(), otlpQueue: { enqueue: handed => { payload = handed; }, flush: async () => {} }, stderr: () => {} });

	log.info(text);

	return { bytes: new TextEncoder().encode(JSON.stringify(payload)).length, payload: payload as OtlpPayload };
}

test("Queue sends at once when its bytes reach maxBatchBytes, whatever batches and loads came before", async t => {
	const { calls } = stubFetch();
	const clock = fakeClock();
	const { bytes, payload } = recordPayload("abc");
	const queueFor = (storage?: QueueStorage) => new Queue({ batchDelayMs: 10000, clock, maxBatchBytes: 2 * bytes, otlpHttpBaseURI: "http://127.0.0.1:4318", storage });
	const logTo = (queue: Queue) => new Log({ clock, otlpQueue: queue, stderr: () => {} });

	const exact = logTo(queueFor());

	exact.info("abc");
	await clock.settle();
	t.strictEqual(calls.length, 0, "one record under maxBatchBytes waits for the timer");
	exact.info("abc");
	await clock.settle();
	t.strictEqual(calls.length, 1, "bytes exactly at maxBatchBytes send now");

	calls.length = 0;

	const batched = logTo(queueFor());

	for (let i = 0; i < 3; i++) {
		batched.info("abc");
	}

	await clock.settle();
	t.deepEqual(calls.map(call => call.body.resourceLogs[0].scopeLogs[0].logRecords.length), [2, 1], "three records go out as a batch that fits and the one left behind");

	calls.length = 0;
	batched.info("abc");
	await clock.settle();
	t.strictEqual(calls.length, 0, "what the batches took no longer counts, so one record waits for the timer");

	const storage = fakeStorage(true);

	storage.data.set("@larvit/log:otlp-queue", JSON.stringify([payload]));

	const loaded = logTo(queueFor(storage));

	await clock.settle();
	calls.length = 0;
	loaded.info("abc");
	await clock.settle();
	t.strictEqual(calls.length, 1, "a record loaded from storage counts toward maxBatchBytes");
	t.end();
});

test("Queue hands its warnings to the warn function it is given, once per message", async t => {
	stubFetch();

	const reports = reportSink();
	const warned: string[] = [];
	const queue = new Queue({ otlpHttpBaseURI: "http://u:p@collector.test:4318", report: reports.report }, msg => { warned.push(msg); });
	const log = new Log({ otlpQueue: queue, stderr: () => {} });

	for (const text of ["x", "y"]) {
		log.info(text);
		await log.flush();
	}

	t.strictEqual(warned.length, 1, "the credential warning goes to warn, once");
	t.deepEqual(reports.lines, [], "and not to report");
	t.end();
});

test("Queue is bounded: drops the oldest when full and reports the count once", async t => {
	const { calls } = stubFetch();
	const reports = reportSink();
	const throwingReport = (msg: string, metadata: Metadata) => {
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

test("Queue keeps a batch it reported a retry for through the maxItems trim", async t => {
	const clock = fakeClock();
	const reports = reportSink();
	let attempts = 0;
	let released = false;
	let retryReleased = false;
	const { calls } = stubFetch(async () => {
		attempts++;

		if (attempts === 1) {
			await waitFor(() => released);

			return response({ status: 503 });
		}

		if (attempts === 2) {
			await waitFor(() => retryReleased);
		}

		return undefined;
	});
	const log = new Log({ clock, otlpQueue: new Queue({ batchDelayMs: 600000, clock, maxItems: 3, otlpHttpBaseURI: "http://127.0.0.1:4318", report: reports.report, retryDelayMs: 1000 }), stderr: () => {} });

	log.info("a");
	log.info("b");
	const flushed = log.flush();

	await waitFor(() => calls.length === 1);
	log.info("c");
	log.info("d");
	log.info("e");
	released = true;
	await flushed;
	log.info("f");
	await clock.advance(1000);
	await waitFor(() => calls.length === 2);

	// The retry is in flight, so the failed batch is no longer spared: the oldest of these goes.
	log.info("g");
	log.info("h");
	log.info("i");
	log.info("j");
	retryReleased = true;
	await log.flush();

	t.deepEqual(exportedRecords(calls.slice(1)), ["a", "b", "f", "h", "i", "j"], "the retry sends the failed batch and the newest record, whether the queue overflowed before the retry wait or during it, and a later overflow drops the oldest");
	t.deepEqual(reports.lines.filter(line => line.msg === "OTLP queue full, oldest items dropped").map(line => line.dropped), [2, 2], "each round reports its drops with their count");
	t.end();
});

test("Queue keeps a batch in storage when a round takes it before the first save runs", async t => {
	const storage = fakeStorage(true);
	let loaded = false;
	let released = false;
	const { getItem } = storage;

	storage.getItem = async key => {
		await waitFor(() => loaded);

		return getItem(key);
	};

	const { calls } = stubFetch(async () => {
		await waitFor(() => released);

		return undefined;
	});
	const queue = new Queue({ otlpHttpBaseURI: "http://127.0.0.1:4318", report: () => {}, storage });
	const log = new Log({ otlpQueue: queue, stderr: () => {} });
	const flushed = queue.flush();

	log.info("only");
	loaded = true;
	await waitFor(() => calls.length === 1);
	await waitFor(() => storage.data.size === 1);
	t.deepEqual(storedRecords(storage), ["only"], "the save that finds no item waiting still writes the batch in flight");
	released = true;
	await flushed;
	await waitFor(() => storage.data.size === 0);
	t.end();
});

test("Queue drops the oldest leftovers over maxItems when it loads them", async t => {
	const storage = fakeStorage(false);
	const reports = reportSink();

	stubFetch(() => { throw new Error("offline"); });
	const before = new Log({ otlpQueue: new Queue({ otlpHttpBaseURI: "http://127.0.0.1:4318", report: () => {}, retryDelayMs: 3600000, storage }), stderr: () => {} });

	before.info("old");
	before.info("middle");
	before.info("new");
	await before.flush();
	await waitFor(() => storedRecords(storage).length === 3);

	const { calls } = stubFetch();
	const after = new Log({ otlpQueue: new Queue({ maxItems: 2, otlpHttpBaseURI: "http://127.0.0.1:4318", report: reports.report, storage }), stderr: () => {} });

	await after.flush();
	t.deepEqual(exportedRecords(calls), ["middle", "new"], "the oldest leftover is dropped");
	t.strictEqual(reports.lines.find(line => line.msg === "OTLP queue full, oldest items dropped")?.dropped, 1, "and counted");
	t.end();
});

test("Queue keeps a batch in storage while it is sent, so a record logged meanwhile is saved behind it", async t => {
	const storage = fakeStorage(false);
	let released = false;
	const { calls } = stubFetch(async () => {
		await waitFor(() => released);

		return undefined;
	});
	const log = new Log({ otlpQueue: new Queue({ otlpHttpBaseURI: "http://127.0.0.1:4318", report: () => {}, storage }), stderr: () => {} });

	log.info("sending");
	const flushed = log.flush();

	await waitFor(() => calls.length === 1);
	log.info("logged during the send");
	await waitFor(() => (storage.data.get("@larvit/log:otlp-queue") ?? "").includes("logged during the send"));
	t.deepEqual(storedRecords(storage), ["sending", "logged during the send"], "the batch in flight is still persisted, in front of the newer record");
	released = true;
	await flushed;
	await waitFor(() => storage.data.size === 0);
	t.strictEqual(storage.data.size, 0, "storage is cleared once the send settles");
	t.end();
});

for (const async of [false, true]) {
	test(`Queue leaves what storage holds alone when its ${async ? "async" : "sync"} getItem throws, and stops writing to it`, async t => {
		const storage = fakeStorage(async);
		const reports = reportSink();
		const held = "a queue a flaky read could not return";

		storage.data.set("@larvit/log:otlp-queue", held);
		storage.getItem = () => {
			if (async) {
				return Promise.reject(new Error("flaky"));
			}

			throw new Error("flaky");
		};

		const { calls } = stubFetch();
		const log = new Log({ otlpQueue: new Queue({ otlpHttpBaseURI: "http://127.0.0.1:4318", report: reports.report, storage }), stderr: () => {} });

		log.info("new");
		await log.flush();
		await log.end();
		t.deepEqual(exportedRecords(calls), ["new"], "new records are still delivered");
		t.strictEqual(storage.data.get("@larvit/log:otlp-queue"), held, "the stored queue is neither removed nor overwritten");
		t.deepEqual(reports.lines, [{ error: "flaky", key: "@larvit/log:otlp-queue", msg: "OTLP queue storage unreadable, stored queue kept and not written to" }], "the failed read is reported once");
		t.end();
	});
}

test("Queue's byte count follows its items, so a delivered or dropped record stops filling the next batch", async t => {
	const clock = fakeClock();
	const big = "a".repeat(5000);
	let attempts = 0;
	const { calls } = stubFetch(() => {
		attempts++;

		return attempts === 1 ? response({ status: 503 }) : undefined;
	});
	const log = new Log({ clock, otlpQueue: new Queue({ batchDelayMs: 600000, clock, maxBatchBytes: 8000, otlpHttpBaseURI: "http://127.0.0.1:4318", report: () => {}, retryDelayMs: 1000 }), stderr: () => {}, stdout: () => {} });

	log.info(big);
	log.info(big);
	await clock.settle();
	t.strictEqual(calls.length, 1, "the second record takes the queue over maxBatchBytes and sends what fits");
	await clock.advance(1000);
	t.strictEqual(calls.length, 3, "the retry delivers the failed batch, then the record that waited behind it");

	log.info("small");
	await clock.settle();
	t.strictEqual(calls.length, 3, "a delivered record no longer counts toward maxBatchBytes");
	await clock.advance(600000);
	t.deepEqual(calls.map(call => call.body.resourceLogs[0].scopeLogs[0].logRecords.length), [1, 1, 1, 1], "one record per POST throughout");

	const bounded = new Log({ clock, otlpQueue: new Queue({ batchDelayMs: 600000, clock, maxBatchBytes: 8000, maxItems: 1, otlpHttpBaseURI: "http://127.0.0.1:4318", report: () => {} }), stderr: () => {}, stdout: () => {} });

	calls.length = 0;
	bounded.info(big);
	bounded.info(big);
	await clock.settle();
	t.strictEqual(calls.length, 0, "a dropped record stops counting too: the one kept is still under maxBatchBytes");
	t.end();
});

test("Queue runs one round at a time, and a flush() arriving mid-round waits for a round of its own", async t => {
	const clock = fakeClock();
	let released = false;
	const { calls } = stubFetch(async () => {
		await waitFor(() => released);

		return response();
	});
	const log = new Log({ clock, otlpQueue: new Queue({ clock, otlpHttpBaseURI: "http://127.0.0.1:4318", report: () => {} }), stderr: () => {} });

	log.info("first");
	const first = log.flush();

	await waitFor(() => calls.length === 1);
	log.info("second");
	let joined = false;
	const second = log.flush().then(() => { joined = true; });

	await clock.settle();
	t.strictEqual(calls.length, 1, "no second POST opens beside the round already in flight");
	t.strictEqual(joined, false, "and the caller that arrived mid-round does not resolve on it");

	released = true;
	await first;
	await second;
	t.deepEqual(exportedRecords(calls), ["first", "second"], "both records are delivered, the mid-round one after");
	t.strictEqual(clock.pending.size, 0, "and the rounds cleared every timer they scheduled");
	t.end();
});

test("Queue keeps one timer: a record arriving during a retry backoff never jumps it", async t => {
	const clock = fakeClock();
	let attempts = 0;
	const { calls } = stubFetch(() => {
		attempts++;

		return attempts === 1 ? response({ status: 503 }) : undefined;
	});
	const log = new Log({ clock, otlpQueue: new Queue({ batchDelayMs: 100, clock, otlpHttpBaseURI: "http://127.0.0.1:4318", report: () => {}, retryDelayMs: 5000 }), stderr: () => {} });

	log.info("first");
	t.strictEqual(clock.pending.size, 1, "one timer waits for the batch to fill");
	await clock.advance(100);
	t.strictEqual(attempts, 1, "which sends it once batchDelayMs is up");
	t.strictEqual(clock.pending.size, 1, "and the failed attempt leaves the retry backoff as the only timer");

	log.info("second");
	t.strictEqual(clock.pending.size, 1, "a record arriving during the backoff schedules nothing beside it");
	await clock.advance(4999);
	t.strictEqual(attempts, 1, "so nothing is attempted before the backoff is up");
	await clock.advance(1);
	t.strictEqual(attempts, 2, "the retry is the next attempt");
	t.deepEqual(exportedRecords(calls), ["first", "first", "second"], "carrying the kept record and the one that waited with it");
	t.strictEqual(clock.pending.size, 0, "nothing is left scheduled");
	t.end();
});

test("Queue keeps one timer: a retry takes over the batch timer a mid-round record scheduled", async t => {
	const clock = fakeClock();
	let released = false;
	let attempts = 0;
	const { calls } = stubFetch(async () => {
		attempts++;

		if (attempts > 1) {
			return undefined;
		}

		await waitFor(() => released);

		return response({ status: 503 });
	});
	const log = new Log({ clock, otlpQueue: new Queue({ batchDelayMs: 100, clock, otlpHttpBaseURI: "http://127.0.0.1:4318", report: () => {}, retryDelayMs: 5000 }), stderr: () => {} });

	log.info("first");
	const flushed = log.flush();

	await waitFor(() => attempts === 1);
	log.info("second");
	released = true;
	await flushed;
	t.strictEqual(clock.pending.size, 1, "the backoff replaces the batch timer the mid-round record scheduled");
	await clock.advance(100);
	t.strictEqual(attempts, 1, "so none survives to send inside the backoff");
	await clock.advance(4900);
	t.strictEqual(attempts, 2, "the retry is still the next attempt");
	t.deepEqual(exportedRecords(calls), ["first", "first", "second"], "carrying the record it kept and the one enqueued mid-round");
	t.strictEqual(clock.pending.size, 0, "nothing is left scheduled");
	t.end();
});

test("Queue with storage writes through one writer, so changes made during a write coalesce into the next", async t => {
	const clock = fakeClock();
	const storage = fakeStorage(true);
	const setItem = storage.setItem;
	let inFlight = 0;
	let concurrent = 0;
	let writes = 0;

	let released = false;

	storage.setItem = async (key, value) => {
		writes++;
		inFlight++;
		concurrent = Math.max(concurrent, inFlight);
		await waitFor(() => released);
		await setItem(key, value);
		inFlight--;
	};
	stubFetch();
	const log = new Log({ clock, otlpQueue: new Queue({ batchDelayMs: 600000, clock, otlpHttpBaseURI: "http://127.0.0.1:4318", report: () => {}, storage }), stderr: () => {} });

	log.info("1");
	await waitFor(() => writes === 1);
	log.info("2");
	log.info("3");
	released = true;
	// Quiescence, not the wanted outcome: a second writer must fail the assertion below, not block this wait.
	await waitFor(() => inFlight === 0 && writes >= 2);
	t.strictEqual(concurrent, 1, "no second writer starts beside the one already writing");
	t.strictEqual(writes, 2, "both records that arrived during that write go out in the one write after it");
	t.strictEqual(JSON.parse(storage.data.get("@larvit/log:otlp-queue") ?? "[]").length, 3, "and that write holds all three");
	t.end();
});

test("Queue schedules the leftovers it loads, with nothing new enqueued", async t => {
	const clock = fakeClock();
	const storage = fakeStorage(true);

	storage.data.set("@larvit/log:otlp-queue", JSON.stringify([{ resourceLogs: [{ resource: { attributes: [] }, scopeLogs: [{ logRecords: [{ body: { stringValue: "leftover" }, severityNumber: 9, severityText: "INFO", timeUnixNano: nanos(clock.now()) }] }] }] }]));

	const { calls } = stubFetch();

	new Queue({ clock, otlpHttpBaseURI: "http://127.0.0.1:4318", report: () => {}, storage });
	await waitFor(() => clock.pending.size === 1);
	await clock.advance(60000);
	t.deepEqual(exportedRecords(calls), ["leftover"], "the batch timer the load set sends them");
	t.end();
});

test("Queue flushed while storage loads sends the leftovers and leaves no batch timer behind", async t => {
	const clock = fakeClock();
	const storage = fakeStorage(true);
	const getItem = storage.getItem;
	let released = false;

	storage.data.set("@larvit/log:otlp-queue", JSON.stringify([{ resourceLogs: [{ resource: { attributes: [] }, scopeLogs: [{ logRecords: [{ body: { stringValue: "leftover" }, severityNumber: 9, severityText: "INFO", timeUnixNano: nanos(clock.now()) }] }] }] }]));
	storage.getItem = async key => {
		await waitFor(() => released);

		return getItem(key);
	};

	const { calls } = stubFetch();
	const queue = new Queue({ clock, otlpHttpBaseURI: "http://127.0.0.1:4318", report: () => {}, storage });
	const flushed = queue.flush();

	released = true;
	await flushed;
	t.deepEqual(exportedRecords(calls), ["leftover"], "the round waits for the load and sends what it held");
	t.strictEqual(clock.pending.size, 0, "the batch timer the load installed is cleared by that round");
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
		const afterReports = reportSink();
		const after = new Log({ otlpQueue: new Queue({ otlpHttpBaseURI, report: afterReports.report, storage }), stderr: () => {} });

		after.info("after restart");
		await after.flush();
		t.deepEqual(exportedRecords(calls), ["before restart", "after restart"], `${label}: leftovers are sent before new records`);
		t.strictEqual(exportedSpans(calls).length, 1, `${label}: the persisted span is delivered too`);
		await waitFor(() => storage.data.size === 0);
		t.strictEqual(storage.data.size, 0, `${label}: storage is cleared once everything is delivered`);
		t.deepEqual(afterReports.lines, [], `${label}: a readable store is reported nowhere`);
	}

	const corrupt = fakeStorage(false);
	const reports = reportSink();

	corrupt.data.set("custom-key", "not json");
	const { calls } = stubFetch();
	const queue = new Queue({ key: "custom-key", otlpHttpBaseURI: "http://127.0.0.1:4318", report: reports.report, storage: corrupt });
	const log = new Log({ otlpQueue: queue, stderr: () => {} });

	log.info("still works");
	await log.flush();
	t.deepEqual(exportedRecords(calls), ["still works"], "corrupt stored data does not block new records");
	t.deepEqual(reports.lines.map(line => line.msg), ["OTLP queue storage unreadable, discarded"], "corrupt data is reported once");
	t.strictEqual(typeof reports.lines[0]?.error, "string", "and says why");

	Reflect.apply(queue.enqueue, queue, [{ resourceMetrics: [] }]);
	await queue.flush();
	t.strictEqual(calls.length, 1, "an enqueued payload of unknown kind is never sent");
	t.deepEqual(reports.lines.slice(1), [{ msg: "OTLP payload of unknown kind, dropped" }], "and is reported by the same rule stored data meets");
	await waitFor(() => corrupt.data.size === 0);
	t.strictEqual(corrupt.data.size, 0, "the custom key is cleared");

	const notAList = fakeStorage(false);
	const notAListReports = reportSink();

	notAList.data.set("@larvit/log:otlp-queue", JSON.stringify({ not: "a list" }));
	new Queue({ otlpHttpBaseURI: "http://127.0.0.1:4318", report: notAListReports.report, storage: notAList });
	await waitFor(() => notAList.data.size === 0);
	t.deepEqual(notAListReports.lines, [{ error: "not a list of OTLP payloads", key: "@larvit/log:otlp-queue", msg: "OTLP queue storage unreadable, discarded" }], "stored JSON that is not a list of payloads is reported and cleared");

	const long = fakeStorage(false);
	const longReports = reportSink();

	long.data.set("@larvit/log:otlp-queue", JSON.stringify(Array.from({ length: 150000 }, () => ({ resourceLogs: [] }))));
	await new Queue({ maxItems: 150000, otlpHttpBaseURI: "http://127.0.0.1:4318", report: longReports.report, storage: long }).flush();
	t.deepEqual(longReports.lines, [], "a stored list too long to pass as call arguments loads without a report");

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
	t.ok(thrown(() => new Log({ otlpHttpBaseURI: "http://127.0.0.1:4318", otlpQueue: queue })).includes("otlpQueue"), "a queue plus the very endpoint it was built with is rejected too");

	const parent = new Log({ otlpHttpBaseURI: "http://127.0.0.1:4318", otlpProtocol: "http/protobuf" });

	t.ok(parent.conf.otlpQueue instanceof Queue, "otlpHttpBaseURI builds a Queue, read back as conf.otlpQueue");
	t.strictEqual(new Log({ parentLog: parent }).conf.otlpQueue, parent.conf.otlpQueue, "a child shares the parent's queue");
	t.strictEqual(parent.clone().conf.otlpQueue, parent.conf.otlpQueue, "a clone shares the queue");
	t.notStrictEqual(new Log({ otlpHttpBaseURI: "http://127.0.0.1:4319", parentLog: parent }).conf.otlpQueue, parent.conf.otlpQueue, "a child with its own endpoint gets its own queue");

	const proto = new Log({ otlpProtocol: "http/json", parentLog: parent });

	t.strictEqual(proto.conf.otlpHttpBaseURI, parent.conf.otlpHttpBaseURI, "overriding one endpoint option still inherits the others");
	t.notStrictEqual(proto.conf.otlpQueue, parent.conf.otlpQueue, "into a queue of its own");

	const custom = new Log({ otlpQueue: queue, parentLog: parent });

	t.strictEqual(custom.conf.otlpQueue, queue, "a child keeps the queue it was given");
	t.strictEqual(custom.conf.otlpHttpBaseURI, undefined, "and does not inherit the parent's endpoint beside it");
	t.doesNotThrow(() => new Log({ ...parent.conf, spanName: "sibling" }), "spreading a conf keeps its queue and endpoint together");
	t.ok(thrown(() => new Log({ ...parent.conf, otlpHttpBaseURI: "http://127.0.0.1:4319" })).includes("otlpQueue"), "a default queue beside an endpoint it was not built from is rejected");
	t.ok(thrown(() => new Log({ ...parent.conf, otlpProtocol: "http/json" })).includes("otlpQueue"), "and beside a protocol it was not built with");
	t.doesNotThrow(() => new Log({ ...parent.conf, otlpProtocol: "http/protobuf" }), "but beside the default protocol spelled out, which is what it sends");

	const rotated = new Log({ otlpAdditionalHeaders: { authorization: "Bearer old" }, otlpHttpBaseURI: "http://127.0.0.1:4318" });
	const rotatedHeaders = { authorization: "Bearer new" };

	rotated.conf.otlpAdditionalHeaders = rotatedHeaders;
	if (rotated.conf.otlpQueue instanceof Queue) {
		rotated.conf.otlpQueue.conf.otlpAdditionalHeaders = rotatedHeaders;
	}
	t.doesNotThrow(() => [new Log({ parentLog: rotated }), rotated.clone(), new Log({ ...rotated.conf })], "headers rotated on both the conf and its queue keep the pair for a child, a clone and a spread");
	rotated.conf.otlpAdditionalHeaders = { authorization: "Bearer newer" };
	t.ok(thrown(() => new Log({ ...rotated.conf })).includes("otlpQueue"), "headers rotated on the conf alone do not");

	const headered = new Log({ otlpAdditionalHeaders: { authorization: "Bearer t0k3n" }, otlpHttpBaseURI: "http://127.0.0.1:4318" });

	t.ok(thrown(() => new Log({ ...headered.conf, otlpAdditionalHeaders: { authorization: "Bearer t0k3n" } })).includes("otlpQueue"), "and beside an equal copy of its headers, which a rotation could make differ");
	t.deepEqual([new Log({ parentLog: headered }), headered.clone()].map(log => log.conf.otlpQueue === headered.conf.otlpQueue), [true, true], "a child or clone of a headered Log shares its queue, since inheritance hands the headers on by reference");

	const elsewhere = [new Log({ otlpHttpBaseURI: "https://other.test", parentLog: headered }), headered.clone({ otlpHttpBaseURI: "http://127.0.0.1:4319" })];

	t.deepEqual(elsewhere.map(log => log.conf.otlpAdditionalHeaders), [undefined, undefined], "a child or clone sending to another origin leaves the parent's headers behind");
	t.strictEqual(new Log({ otlpHttpBaseURI: "http://127.0.0.1:4318/tenant", parentLog: headered }).conf.otlpAdditionalHeaders, headered.conf.otlpAdditionalHeaders, "one sending to the same origin keeps them");
	t.strictEqual(new Log({ otlpAdditionalHeaders: headered.conf.otlpAdditionalHeaders }).clone({ otlpHttpBaseURI: "https://other.test" }).conf.otlpAdditionalHeaders, headered.conf.otlpAdditionalHeaders, "so does one whose source names no endpoint the headers belong to");
	t.end();
});

test("JSON.stringify of a conf holding a Queue carries the queue's conf, even with a batch pending", async t => {
	stubFetch();

	const log = new Log({ otlpHttpBaseURI: "http://127.0.0.1:4318", stderr: () => {}, stdout: () => {} });

	log.info("pending");

	const stringified: unknown = JSON.parse(JSON.stringify(log.conf));

	t.deepEqual(stringified, JSON.parse(JSON.stringify({ ...log.conf, otlpQueue: log.conf.otlpQueue instanceof Queue ? log.conf.otlpQueue.conf : undefined })), "the queue stringifies as its conf, none of its working state");
	await log.end();

	const storage = Object.assign(fakeStorage(false), { sessionToken: "s3cr3t" });
	const stored = new Log({ otlpQueue: new Queue({ otlpHttpBaseURI: "http://127.0.0.1:4318", storage }), stderr: () => {}, stdout: () => {} });

	Object.assign(storage, { self: storage });
	t.notOk(JSON.stringify(stored.conf).includes("s3cr3t"), "what a storage holds stays out, and a circular one no longer throws");
	t.notOk(stored.conf.otlpQueue instanceof Queue && JSON.stringify(stored.conf.otlpQueue.conf).includes("s3cr3t"), "so does queue.conf's own stringify");
	t.ok(stored.conf.otlpQueue instanceof Queue && { ...stored.conf.otlpQueue.conf }.storage === undefined, "and a spread of it");
	t.ok(stored.conf.otlpQueue instanceof Queue && stored.conf.otlpQueue.conf.storage === storage, "the live conf keeps its storage");
	await stored.end();
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

	const sdkVersion = resourceAttr(traceResource.resource.attributes, "telemetry.sdk.version");

	t.deepEqual(traceResource.scopeSpans[0].scope, { name: "@larvit/log", version: sdkVersion }, "the span's scope is this library at its version");
	t.deepEqual(logsBody.resourceLogs[0].scopeLogs[0].scope, { name: "@larvit/log", version: sdkVersion }, "and so is the records'");
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

const encodeURIComponentTimes = (text: string, times: number): string => times === 0 ? text : encodeURIComponentTimes(encodeURIComponent(text), times - 1);

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
	await new Log(conf).end({ error: new TypeError("Request cannot be constructed from a URL that includes credentials: http://myuser:hunter2@api.test/x, retried against https://backup:s3cr3t@api.test/x") });
	await new Log(conf).end({ error: new Error("GET https://api.test/mail@example.com?to=a@b failed, //h.test?to=a@b //h.test#a@b \\\\h/a@b \\\\h?a@b \\\\h#a@b \\\\h x@b") });
	// Scheme-relative: Node cannot parse one without a base and quotes it back as given.
	await new Log(conf).end({ error: new TypeError("Failed to parse URL from //myuser:hunter2@api.test/x?access_token=s3cr3t") });
	await new Log(conf).end({ error: new DOMException("aborted", "AbortError") });
	await new Log(conf).end({ error: new Error("https://myuser:hunter2@api.test/x?page=2&Access_Token=s3cr3t&next=https%3A%2F%2Fu%3Ahunter2%40cb.test#top") });
	await new Log(conf).end({ error: new Error("https://a.test/?" + "u=https://a/?".repeat(5000) + "token=s3cr3t") });
	await new Log(conf).end({ error: new Error("http:myuser:hunter2@h.test/x") });
	await new Log(conf).end({ error: new Error("db postgres://u:p\\\\w@h and \\\\v:qw@h failed") });
	await new Log(conf).end({ error: new Error("db https:\\/u:pwmix6@h failed") });
	await new Log(conf).end({ error: new Error("request to https://api.test/x?page=2&token=s3cr3tA failed, retry /cb?Access_Token=s3cr3tB&code=s3cr3tC#top") });
	await new Log(conf).end({ error: new Error("request to https://api.test/x%3Fpage=2%26token%3Ds3cr3tD failed") });
	await new Log(conf).end({ error: new Error("lookup https://api.test/x?keyword=kept&q=a?b=c failed") });
	await new Log(conf).end({ error: new Error("request to https://h.test/x?next=https://i.test/y?token=s3cr3tE&sig=s3cr3tF?G failed") });
	await new Log(conf).end({ error: new Error("request to https://h.test/x?si\tg=s3cr3tH failed") });
	await new Log(conf).end({ error: new Error("request to https://h.test/x?my token=s3cr3tJ&a#token=s3cr3tK failed") });
	await new Log(conf).end({ error: new Error("request to " + encodeURIComponentTimes("h.test/x?token=s3cr3tI", 9) + " failed") });
	await new Log(conf).end({ error: new Error("request to https://h.test/x?iss&code=s3cr3tL&x?code=s3cr3tM failed") });
	await new Log(conf).end({ error: new Error("request to https://h.test/x?to\nken=s3cr3tN&si\rg=s3cr3tO failed") });
	await new Log(conf).end({ error: new Error("request to https://h.test/x?sig=a?code=s3cr3tP failed") });
	await new Log(conf).end({ error: new Error("redirect to https://h.test/cb#access_token=s3cr3tQ&token_type=bearer, then /cb?page=2#id_token=s3cr3tR failed") });
	await new Log(conf).end({ error: new Error("redirect to https://h.test/cb?#code=s3cr3tS&state=a, then /cb?x#code=s3cr3tT failed") });
	await new Log(conf).end({ error: new Error("request to https://h.test/x?token=ab\tcd&sig=ef\ngh&code=ij\rkl failed") });
	await new Log(conf).end({ error: new Error("request to https://h.test/x?token=abc\nWhy? api_key=s3cr3tU failed") });
	await new Log(conf).end({ error: new Error("request to https://h.test/x?token=abcd? token=s3cr3tV failed") });
	await new Log(conf).end({ error: new Error("request to https://h.test/x?token=a?sig= failed") });
	await new Log(conf).end({ error: new Error("retry https://admin:hun\tter2@db.test/x") });
	await new Log(conf).end({ error: new Error("retry https://ad\nmin:hunter2@db.test/x and //u:p\rw@h") });
	await new Log(conf).end({ error: new Error("db \\\\u:p\tw@h and https:\\/ad\nmin:pw@h and /\\u:p\rw@h failed") });

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
	t.deepEqual(exportedSpan(6).status, { code: 2, message: "Request cannot be constructed from a URL that includes credentials: http://REDACTED@api.test/x, retried against https://REDACTED@api.test/x" }, "a url in free text has its userinfo redacted in place");
	t.deepEqual(exportedSpan(7).status, { code: 2, message: "GET https://api.test/mail@example.com?to=a@b failed, //h.test?to=a@b //h.test#a@b \\\\h/a@b \\\\h?a@b \\\\h#a@b \\\\h x@b" }, "an @ outside the userinfo position is left alone");
	t.deepEqual(exportedSpan(8).status, { code: 2, message: "Failed to parse URL from //REDACTED@api.test/x?access_token=REDACTED" }, "a url the runtime cannot parse has its userinfo and its listed keys redacted");
	t.strictEqual(attr(exportedSpan(9), "error.type"), "AbortError", "a numeric code is skipped for the error name");
	t.deepEqual(exportedSpan(10).status, { code: 2, message: "https://REDACTED@api.test/x?page=2&Access_Token=REDACTED&next=REDACTED#top" }, "a message that is a url has its userinfo, listed keys and nested credentials redacted, its fragment kept");
	t.ok(!exportedSpan(11).status.message.includes("s3cr3t"), "a url nested thousands deep in query values ends the span and is redacted");
	t.deepEqual(exportedSpan(12).status, { code: 2, message: "http://REDACTED@h.test/x" }, "a slashless spelling the runtime's URL parses is a url too");
	t.deepEqual(exportedSpan(13).status, { code: 2, message: "db postgres://REDACTED@h and \\\\REDACTED@h failed" }, "userinfo after // is redacted with any backslash it holds, and so is userinfo after \\\\");
	t.deepEqual(exportedSpan(14).status, { code: 2, message: "db https:\\/REDACTED@h failed" }, "and userinfo after a mixed \\/");
	t.deepEqual(exportedSpan(15).status, { code: 2, message: "request to https://api.test/x?page=2&token=REDACTED failed, retry /cb?Access_Token=REDACTED&code=REDACTED#top" }, "a listed key in free text, a relative url included, has its value redacted in place");
	t.deepEqual(exportedSpan(16).status, { code: 2, message: "REDACTED" }, "a listed key percent-encoded in free text records REDACTED for the whole message");
	t.deepEqual(exportedSpan(17).status, { code: 2, message: "lookup https://api.test/x?keyword=kept&q=a?b=c failed" }, "a key that no listed name ends leaves the message alone");
	t.deepEqual(exportedSpan(18).status, { code: 2, message: "request to https://h.test/x?next=https://i.test/y?token=REDACTED&sig=REDACTED failed" }, "a listed key after a ? in another pair's value is redacted, and a ? in a listed value goes with it");
	t.deepEqual(exportedSpan(19).status, { code: 2, message: "request to https://h.test/x?si\tg=REDACTED failed" }, "a tab the parser drops from a key doesn't hide it");
	t.deepEqual(exportedSpan(20).status, { code: 2, message: "request to https://h.test/x?my token=REDACTED&a#token=REDACTED failed" }, "a key holding a space is read whole, and one after a # is read from it");
	t.deepEqual(exportedSpan(21).status, { code: 2, message: "REDACTED" }, "a key encoded nine times, past what is decoded, records REDACTED for the whole message");
	t.deepEqual(exportedSpan(22).status, { code: 2, message: "request to https://h.test/x?iss&code=REDACTED&x?code=REDACTED failed" }, "a key follows a bare key's &, and a ? after the last pair's name");
	t.deepEqual(exportedSpan(23).status, { code: 2, message: "request to https://h.test/x?to\nken=REDACTED&si\rg=REDACTED failed" }, "a newline or carriage return the parser drops from a key doesn't hide it");
	t.deepEqual(exportedSpan(24).status, { code: 2, message: "request to https://h.test/x?sig=REDACTED failed" }, "a listed key's value holding a ? and a listed name is redacted in place");
	t.deepEqual(exportedSpan(25).status, { code: 2, message: "redirect to https://h.test/cb#access_token=REDACTED&token_type=bearer, then /cb?page=2#id_token=REDACTED failed" }, "a listed key opening a fragment, as in an OAuth implicit-flow redirect, is redacted in place");
	t.deepEqual(exportedSpan(26).status, { code: 2, message: "redirect to https://h.test/cb?#code=REDACTED&state=a, then /cb?x#code=REDACTED failed" }, "`code`, which only an exact name lists, is redacted opening a fragment after a bare ? or a bare key");
	t.deepEqual(exportedSpan(27).status, { code: 2, message: "request to https://h.test/x?token=REDACTED&sig=REDACTED&code=REDACTED failed" }, "a tab, newline or carriage return the parser drops from a listed value doesn't end its redaction");
	t.deepEqual(exportedSpan(28).status, { code: 2, message: "request to https://h.test/x?token=REDACTED api_key=REDACTED failed" }, "a ? that a listed value swallows still opens the next key, a space included");
	t.deepEqual(exportedSpan(29).status, { code: 2, message: "request to https://h.test/x?token=REDACTED token=REDACTED failed" }, "and so does one with no tab or newline in the value");
	t.deepEqual(exportedSpan(30).status, { code: 2, message: "request to https://h.test/x?token=REDACTED failed" }, "a listed pair that ends where the redacted value ends is part of it, and is not redacted twice");
	t.deepEqual(exportedSpan(31).status, { code: 2, message: "retry https://REDACTED@db.test/x" }, "a tab the parser drops from a password doesn't hide the userinfo");
	t.deepEqual(exportedSpan(32).status, { code: 2, message: "retry https://REDACTED@db.test/x and //REDACTED@h" }, "nor does a newline in a user or a carriage return in a password");
	t.deepEqual(exportedSpan(33).status, { code: 2, message: "db \\\\REDACTED@h and https:\\/REDACTED@h and /\\REDACTED@h failed" }, "nor does one after a backslash opener");
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

	const { logRecord, resourceAttrs: logResourceAttrs, scope: logScope } = pbDecodeLogs(logsCall.rawBody);
	const { resourceAttrs: spanResourceAttrs, scope: spanScope, span } = pbDecodeSpans(tracesCall.rawBody);

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

	t.strictEqual(spanScope.name, "@larvit/log", "the span's scope is this library on the wire");
	t.ok(/^\d+\.\d+\.\d+/.test(spanScope.version), "at its version");
	t.deepEqual(logScope, spanScope, "and so is the records'");
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

test("Queue under a clock whose setTimeout throws still runs the round a mid-round flush() joins", async t => {
	let broken = false;
	let released = false;
	const clock = {
		clearTimeout: (timer?: TimerHandle) => clearTimeout(timer),
		now: () => Date.now(),
		setTimeout: (callback: () => void, delayMs: number) => {
			if (broken) throw new Error("clock broke");

			return setTimeout(callback, delayMs);
		},
	};
	const { calls } = stubFetch(async () => {
		await waitFor(() => released);

		return response();
	});
	const log = new Log({ otlpQueue: new Queue({ batchDelayMs: 600000, clock, otlpHttpBaseURI: "http://127.0.0.1:4318", report: () => {} }), stderr: () => {}, stdout: () => {} });

	log.info("lost");
	broken = true;

	const failed = log.flush().then(() => "resolved", () => "rejected");
	const joined = log.flush().then(() => "resolved", () => "rejected");

	t.strictEqual(await failed, "rejected", "the round the throw breaks rejects");
	t.strictEqual(await joined, "resolved", "the flush() that joined it runs a round of its own");

	broken = false;
	log.info("second");
	const round = log.flush();

	await waitFor(() => calls.length === 1);
	log.info("third");
	const next = log.flush();

	released = true;
	await round;
	await next;
	t.deepEqual(exportedRecords(calls), ["second", "third"], "and a later mid-round flush() queues a round again");
	t.end();
});

test("a pending batch timer never holds the process, including one set by a record logged mid-export", async t => {
	const timers: { unrefs: number }[] = [];
	let released = false;
	const clock = {
		clearTimeout: () => {},
		now: () => Date.now(),
		// Collect only batch timers, known by their delay: the export's 3 s abort timer runs on this clock too.
		setTimeout: (_callback: () => void, delayMs: number) => {
			const timer = { unref() { this.unrefs++; }, unrefs: 0 };

			if (delayMs === 600000) timers.push(timer);

			return timer as unknown as TimerHandle;
		},
	};
	const { calls } = stubFetch(async () => {
		await waitFor(() => released);

		return response();
	});
	const log = new Log({ otlpQueue: new Queue({ batchDelayMs: 600000, clock, otlpHttpBaseURI: "http://127.0.0.1:4318", report: () => {} }), stderr: () => {}, stdout: () => {} });

	log.info("first");
	t.strictEqual(timers.length, 1, "a record logged sets one batch timer");

	const round = log.flush();

	await waitFor(() => calls.length === 1);
	log.info("second");

	released = true;
	await round;
	t.ok(timers.every(timer => timer.unrefs === 1), "every batch timer set is unref'd once");
	t.end();
});

test("unref hands a numeric timer id to the runtime's unrefTimer", t => {
	const unrefed: unknown[] = [];

	unref(7, id => { unrefed.push(id); });
	t.deepEqual(unrefed, [7], "the id reaches unrefTimer");
	t.end();
});

test("unref leaves a numeric timer id alone where the runtime has no unrefTimer", t => {
	t.doesNotThrow(() => { unref(7, undefined); }, "nothing to call, and nothing thrown");
	t.end();
});

test("unref calls an object timer's own unref, and never the runtime's unrefTimer", t => {
	const unrefed: unknown[] = [];
	let unrefs = 0;

	unref({ unref: () => { unrefs++; } } as unknown as TimerHandle, id => { unrefed.push(id); });
	t.strictEqual(unrefs, 1, "the timer's unref ran once");
	t.deepEqual(unrefed, [], "unrefTimer was not called");
	t.end();
});

// The one test that swaps the Deno global, to prove an injected clock's ids never reach it.
test("an injected clock's numeric timer id is never handed to Deno's unrefTimer", async t => {
	const unrefed: unknown[] = [];
	const original: unknown = Reflect.get(globalThis, "Deno");
	const clock = { clearTimeout: () => {}, now: () => Date.now(), setTimeout: () => 7 };

	Reflect.set(globalThis, "Deno", { unrefTimer: (id: unknown) => { unrefed.push(id); } });
	try {
		const log = new Log({ otlpQueue: new Queue({ batchDelayMs: 600000, clock, otlpHttpBaseURI: "http://127.0.0.1:4318", report: () => {} }), stderr: () => {}, stdout: () => {} });

		log.info("first");
	} finally {
		if (original === undefined) {
			Reflect.deleteProperty(globalThis, "Deno");
		} else {
			Reflect.set(globalThis, "Deno", original);
		}
	}

	t.deepEqual(unrefed, [], "a stranger's timer id is left alone");
	t.end();
});

test("statusFailure counts a 2xx status as delivered", t => {
	t.strictEqual(statusFailure(204), undefined, "no failure to act on");
	t.end();
});

for (const status of [408, 429, 500, 503]) {
	test(`statusFailure retries a ${status} status`, t => {
		t.strictEqual(statusFailure(status)?.retry, true, "the batch is retried");
		t.end();
	});
}

for (const status of [300, 400, 404, 413]) {
	test(`statusFailure drops the batch on a ${status} status`, t => {
		t.strictEqual(statusFailure(status)?.retry, false, "the batch is not retried");
		t.end();
	});
}

for (const status of [401, 403]) {
	test(`statusFailure reports a ${status} status as unauthorized and doesn't retry it`, t => {
		t.deepEqual(statusFailure(status), { message: "Non-ok return status", reportAs: "OTLP export unauthorized, batch dropped", retry: false, status }, "reported once, then dropped");
		t.end();
	});
}

test("plainHttpWarnings names each credential header and never its value", t => {
	const warnings = plainHttpWarnings(new Headers({ Authorization: "Basic c2VjcmV0", "Content-Type": "application/json", "X-Api-Key": "k-123" }), "collector.test", { "X-Api-Key": "k-123" });

	t.strictEqual(warnings.length, 2, "authorization and x-api-key, not content-type");
	t.ok(warnings.every(warning => warning.includes("collector.test")), "each names the host");
	t.notOk(warnings.some(warning => warning.includes("k-123") || warning.includes("c2VjcmV0")), "no value is quoted");
	t.end();
});

test("plainHttpWarnings blames the endpoint's userinfo for an Authorization header the additional headers don't set", t => {
	const [warning] = plainHttpWarnings(new Headers({ Authorization: "Basic c2VjcmV0" }), "collector.test", undefined);

	t.ok(warning.includes("user:pass@ in otlpHttpBaseURI"), "the source is the userinfo");
	t.end();
});

test("encodeBatch hands back a failure that is not retried when a payload cannot be encoded", t => {
	const unencodable = { payload: { resourceLogs: [{ resource: {}, scopeLogs: [{ logRecords: [{ get body(): never { throw new Error("corrupt"); } }] }] }] } } as unknown as Parameters<typeof encodeBatch>[0][number];

	t.deepEqual(encodeBatch([unencodable], false), { failure: { message: "corrupt", retry: false } }, "corrupt and dropped");
	t.end();
});

test("an export the collector doesn't answer is aborted after 3 s and retried", async t => {
	const clock = fakeClock();
	const sink = reportSink();
	const queue = new Queue({ clock, otlpHttpBaseURI: "http://127.0.0.1:4318", report: sink.report });

	let sent = false;

	globalThis.fetch = ((_url: string, init: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
		sent = true;
		init.signal.addEventListener("abort", () => { reject(new Error("aborted")); });
	})) as unknown as typeof fetch;
	new Log({ otlpQueue: queue, stderr: () => {} }).info("x");
	void queue.flush();
	await waitFor(() => sent);
	await clock.advance(2999);
	t.deepEqual(sink.lines, [], "nothing is reported before 3 s");
	await clock.advance(1);
	t.deepEqual(sink.lines.map(line => [line.msg, line.error]), [["OTLP export failed, will retry", "aborted"]], "at 3 s the send is aborted, and the batch kept for a retry");
	t.end();
});

test("a clock missing one of now, setTimeout and clearTimeout is rejected by the Queue constructor", t => {
	const clock = { now: () => 0, setTimeout: () => 1 } as unknown as Clock;

	t.ok(thrown(() => new Queue({ clock, otlpHttpBaseURI: "http://127.0.0.1:4318" })).includes("clock must be { now, setTimeout, clearTimeout }"), "the error names the shape a clock takes");
	t.end();
});

test("a malformed percent escape in the endpoint's password is sent as written in the Basic credential", async t => {
	const { calls } = stubFetch();
	const queue = new Queue({ otlpHttpBaseURI: "http://user:p%zz@127.0.0.1:4318", report: () => {} });

	new Log({ otlpQueue: queue, stderr: () => {} }).info("x");
	await queue.flush();
	t.strictEqual(callHeader(calls[0], "authorization"), `Basic ${btoa("user:p%zz")}`, "the escape stays undecoded, and the constructor did not throw");
	t.end();
});

test("a removeItem that throws while discarding an unreadable stored queue is not reported, and the next save overwrites it", async t => {
	stubFetch(() => response({ status: 503 }));
	const storage = fakeStorage(false);
	const sink = reportSink();

	storage.data.set("@larvit/log:otlp-queue", "{ not json");
	storage.removeItem = () => { throw new Error("removeItem broke"); };

	const queue = new Queue({ otlpHttpBaseURI: "http://127.0.0.1:4318", report: sink.report, retryDelayMs: 600000, storage });

	new Log({ otlpQueue: queue, stderr: () => {} }).info("kept");
	await queue.flush();
	t.deepEqual(sink.lines.map(line => line.msg).filter(msg => String(msg).startsWith("OTLP queue storage")), ["OTLP queue storage unreadable, discarded"], "only the discard is reported");
	t.deepEqual(storedRecords(storage), ["kept"], "the next save overwrote the unreadable value");
	t.end();
});

test("a removeItem that throws once the queue empties is reported as a failed write", async t => {
	stubFetch();
	const storage = fakeStorage(false);
	const sink = reportSink();

	storage.removeItem = () => { throw new Error("removeItem broke"); };

	const queue = new Queue({ otlpHttpBaseURI: "http://127.0.0.1:4318", report: sink.report, storage });

	new Log({ otlpQueue: queue, stderr: () => {} }).info("x");
	await queue.flush();
	await waitFor(() => sink.lines.length > 0);
	t.deepEqual(sink.lines, [{ error: "removeItem broke", key: "@larvit/log:otlp-queue", msg: "OTLP queue storage write failed" }], "the failed removal is reported with its error");
	t.end();
});
