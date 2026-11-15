import { type Context, context, type ContextManager, ROOT_CONTEXT, SpanKind, SpanStatusCode, trace } from "@opentelemetry/api";
import { fakeClock, nanos, thrown, withGlobals } from "./test-doubles.js";
import { Log, type LogOptions, type OtlpPayload, type TransportSpan } from "../index.js";
import { logTracerProvider, runWithLog } from "../otel.js";
import test from "./tap.js";

// The contract of OpenTelemetry's context manager with no async hooks: the context `with` is handed
// is active until its callback returns.
class StackContextManager implements ContextManager {
	private current = ROOT_CONTEXT;

	active(): Context {
		return this.current;
	}

	bind<T>(_context: Context, target: T): T {
		return target;
	}

	disable(): this {
		return this;
	}

	enable(): this {
		return this;
	}

	with<A extends unknown[], F extends (...args: A) => ReturnType<F>>(active: Context, callback: F, thisArg?: ThisParameterType<F>, ...args: A): ReturnType<F> {
		const previous = this.current;

		this.current = active;
		try {
			return callback.call(thisArg, ...args);
		} finally {
			this.current = previous;
		}
	}
}

function installContextManager(): void {
	context.setGlobalContextManager(new StackContextManager());
}

installContextManager();
trace.setGlobalTracerProvider(logTracerProvider());

// What an instrumentation package holds: a tracer from OpenTelemetry's global API.
const pgTracer = trace.getTracer("@opentelemetry/instrumentation-pg", "0.61.0");

function requestLog(options: LogOptions = {}) {
	const spans: TransportSpan[] = [];
	const stderr: string[] = [];
	const clock = fakeClock();
	const log = new Log({ clock, context: { "service.name": "shop" }, spanName: "GET /orders", stderr: line => { stderr.push(line); }, transports: [{ span: span => { spans.push(span); } }], ...options });

	return { clock, log, spans, stderr };
}

test("a span recorded inside runWithLog is handed to the Log's transports, under the Log's span", async t => {
	const { clock, log, spans, stderr } = requestLog();

	await runWithLog(log, async () => {
		const span = pgTracer.startSpan("SELECT orders", { attributes: { "db.rows": 3, "db.system.name": "postgresql" }, kind: SpanKind.CLIENT });

		await clock.advance(25);
		span.setAttribute("db.cached", false);
		span.end();
	});

	t.deepEqual(spans, [{
		attributes: {
			"db.cached": false,
			"db.rows": 3,
			"db.system.name": "postgresql",
			"otel.scope.name": "@opentelemetry/instrumentation-pg",
			"otel.scope.version": "0.61.0",
			"service.name": "shop",
		},
		span: {
			attributes: [
				{ key: "otel.scope.name", value: { stringValue: "@opentelemetry/instrumentation-pg" } },
				{ key: "otel.scope.version", value: { stringValue: "0.61.0" } },
				{ key: "db.rows", value: { stringValue: "3" } },
				{ key: "db.system.name", value: { stringValue: "postgresql" } },
				{ key: "db.cached", value: { stringValue: "false" } },
			],
			droppedAttributesCount: 0,
			droppedEventsCount: 0,
			droppedLinksCount: 0,
			endTimeUnixNano: nanos(1758150000025),
			events: [],
			kind: 3,
			links: [],
			name: "SELECT orders",
			parentSpanId: log.span.spanId,
			spanId: spans[0]?.span.spanId,
			startTimeUnixNano: nanos(1758150000000),
			status: { code: 0 },
			traceId: log.span.traceId,
		},
	}]);
	t.ok(/^[0-9a-f]{16}$/.test(spans[0]?.span.spanId ?? ""));
	t.notStrictEqual(spans[0]?.span.spanId, log.span.spanId);
	t.deepEqual(stderr, []);
});

test("startActiveSpan takes options, and a context in place of the active one", t => {
	const active = requestLog();
	const handed = requestLog();
	const handedContext = runWithLog(handed.log, () => context.active());

	runWithLog(active.log, () => {
		pgTracer.startActiveSpan("with options", { kind: SpanKind.CLIENT }, span => span.end());
		t.strictEqual(pgTracer.startActiveSpan("with a context", { kind: SpanKind.SERVER }, handedContext, span => {
			pgTracer.startSpan("nested").end();
			span.end();

			return "returned";
		}), "returned");
	});

	t.deepEqual(active.spans.map(({ span }) => [span.name, span.kind]), [["with options", 3]]);
	t.deepEqual(handed.spans.map(({ span }) => [span.name, span.kind, span.parentSpanId === handed.log.span.spanId]), [["nested", 1, false], ["with a context", 2, true]]);
	t.strictEqual(handed.spans[0]?.span.parentSpanId, handed.spans[1]?.span.spanId);
});

test("a span started while another is active nests under it, as does a later sibling under the Log", t => {
	const { log, spans } = requestLog();

	runWithLog(log, () => {
		pgTracer.startActiveSpan("transaction", outer => {
			pgTracer.startSpan("INSERT").end();
			outer.end();
		});
		pgTracer.startSpan("SELECT", {}, context.active()).end();
	});

	const [insert, transaction, select] = spans.map(({ span }) => span);

	t.deepEqual(spans.map(({ span }) => span.name), ["INSERT", "transaction", "SELECT"]);
	t.strictEqual(insert?.parentSpanId, transaction?.spanId);
	t.strictEqual(transaction?.parentSpanId, log.span.spanId);
	t.strictEqual(select?.parentSpanId, log.span.spanId);
	t.deepEqual(spans.map(({ span }) => span.traceId), [log.span.traceId, log.span.traceId, log.span.traceId]);
	t.deepEqual(spans.map(({ span }) => span.kind), [1, 1, 1]);
});

test("each of the four other span kinds maps to its OTLP number", t => {
	const { log, spans } = requestLog();

	runWithLog(log, () => {
		for (const kind of [SpanKind.SERVER, SpanKind.PRODUCER, SpanKind.CONSUMER, SpanKind.INTERNAL]) {
			pgTracer.startSpan("op", { kind }).end();
		}
	});

	t.deepEqual(spans.map(({ span }) => span.kind), [2, 4, 5, 1]);
});

test("runWithLog inside runWithLog sends each span through the Log nearest to it", t => {
	const outer = requestLog();
	const inner = requestLog();

	runWithLog(outer.log, () => {
		runWithLog(inner.log, () => pgTracer.startSpan("inner").end());
		pgTracer.startSpan("outer").end();
	});

	t.deepEqual(inner.spans.map(({ span }) => [span.name, span.traceId, span.parentSpanId]), [["inner", inner.log.span.traceId, inner.log.span.spanId]]);
	t.deepEqual(outer.spans.map(({ span }) => [span.name, span.traceId, span.parentSpanId]), [["outer", outer.log.span.traceId, outer.log.span.spanId]]);
});

test("runWithLog returns what the callback returns and passes on what it throws", t => {
	const { log } = requestLog();

	t.strictEqual(runWithLog(log, () => 42), 42);
	t.strictEqual(thrown(() => runWithLog(log, () => { throw new Error("from the callback"); })), "Error: from the callback");
});

test("a span started outside runWithLog records nothing and exports nothing", t => {
	const { log, spans } = requestLog();
	const span = pgTracer.startSpan("orphan");

	span.setAttribute("a", 1).setStatus({ code: SpanStatusCode.ERROR }).end();

	t.strictEqual(span.isRecording(), false);
	t.strictEqual(trace.isSpanContextValid(span.spanContext()), false);
	t.deepEqual(spans, []);
	t.strictEqual(log.ended, false);
});

test("under a Log whose trace is unsampled, a span exports nothing and carries the Log's ids with the sampled flag off", t => {
	const traceId = "0af7651916cd43dd8448eb211c80319c";
	const { log, spans } = requestLog({ traceparent: `00-${traceId}-b7ad6b7169203331-00` });

	runWithLog(log, () => {
		const span = pgTracer.startSpan("SELECT");

		t.strictEqual(span.isRecording(), false);
		t.deepEqual(span.spanContext(), { spanId: log.span.spanId, traceFlags: 0, traceId });
		span.end();
	});

	t.deepEqual(spans, []);
});

test("a recording span's context carries its own id, the Log's trace and the sampled flag", t => {
	const { log, spans } = requestLog();

	runWithLog(log, () => {
		const span = pgTracer.startSpan("SELECT");

		t.strictEqual(span.isRecording(), true);
		span.end();
		t.strictEqual(span.isRecording(), false);
		t.deepEqual(span.spanContext(), { spanId: spans[0]?.span.spanId, traceFlags: 1, traceId: log.span.traceId });
	});
});

test("an ERROR status is exported with its message, and an OK status without one", t => {
	const { log, spans } = requestLog();

	runWithLog(log, () => {
		pgTracer.startSpan("failed").setStatus({ code: SpanStatusCode.ERROR, message: "relation \"orders\" does not exist" }).end();
		pgTracer.startSpan("ok").setStatus({ code: SpanStatusCode.OK, message: "ignored" }).end();
		// OpenTelemetry's API: OK is final, and UNSET is ignored.
		pgTracer.startSpan("stays ok").setStatus({ code: SpanStatusCode.OK }).setStatus({ code: SpanStatusCode.ERROR, message: "late" }).end();
		pgTracer.startSpan("stays error").setStatus({ code: SpanStatusCode.ERROR, message: "kept" }).setStatus({ code: SpanStatusCode.UNSET }).end();
	});

	t.deepEqual(spans.map(({ span }) => span.status), [
		{ code: 2, message: "relation \"orders\" does not exist" },
		{ code: 1 },
		{ code: 1 },
		{ code: 2, message: "kept" },
	]);
});

test("a start or end time the caller gives is exported, as a Date, an epoch number or an HrTime", t => {
	const { log, spans } = requestLog();
	// An epoch number is told from a performance.now() one by the process's start, so this one follows it.
	const epochMs = Math.ceil(performance.timeOrigin) + 3;

	runWithLog(log, () => {
		pgTracer.startSpan("dated", { startTime: new Date(1758150000001) }).end(new Date(1758150000002));
		pgTracer.startSpan("numbered", { startTime: epochMs }).end(epochMs + 1.5);
		pgTracer.startSpan("hr", { startTime: [1758150000, 5000001] }).end([1758150000, 6000000]);
	});

	t.deepEqual(spans.map(({ span }) => [span.startTimeUnixNano, span.endTimeUnixNano]), [
		["1758150000001000000", "1758150000002000000"],
		[`${epochMs}000000`, `${epochMs + 1}500000`],
		["1758150000005000001", "1758150000006000000"],
	]);
});

test("a number below the process's start is read as performance.now()", t => {
	const { log, spans } = requestLog();

	runWithLog(log, () => pgTracer.startSpan("perf", { startTime: 1500 }).end(1500.25));

	const startMs = Number(spans[0]?.span.startTimeUnixNano) / 1000000;
	const endMs = Number(spans[0]?.span.endTimeUnixNano) / 1000000;

	// A double holds an epoch in milliseconds to about a microsecond.
	t.ok(Math.abs(startMs - (performance.timeOrigin + 1500)) < 0.01, `started at ${startMs}`);
	t.ok(Math.abs(endMs - startMs - 0.25) < 0.01, `lasted ${endMs - startMs}`);
});

test("a number equal to the process's start is an epoch", t => {
	const { log, spans } = requestLog();
	const epochMs = Math.ceil(performance.timeOrigin);

	withGlobals({ performance: { timeOrigin: epochMs } }, () => {
		runWithLog(log, () => pgTracer.startSpan("at the start", { startTime: epochMs }).end(epochMs));
	});

	t.strictEqual(spans[0]?.span.startTimeUnixNano, `${epochMs}000000`);
});

test("on a runtime with no performance global, every number is an epoch", t => {
	const { log, spans } = requestLog();

	withGlobals({ performance: undefined }, () => {
		runWithLog(log, () => pgTracer.startSpan("early", { startTime: 1500 }).end(1501));
	});

	t.deepEqual([spans[0]?.span.startTimeUnixNano, spans[0]?.span.endTimeUnixNano], ["1500000000", "1501000000"]);
});

test("events, links and attribute values OTLP's stringValue cannot hold are left out and counted", t => {
	const { log, spans } = requestLog();
	const link = { context: { spanId: "b7ad6b7169203331", traceFlags: 1, traceId: "0af7651916cd43dd8448eb211c80319c" } };

	runWithLog(log, () => {
		const span = pgTracer.startSpan("batch", { attributes: { "db.ids": [1, 2], kept: "yes" }, links: [link] });

		span.addEvent("retry").addEvent("retry", { attempt: 2 });
		span.recordException(new Error("boom"));
		span.addLink(link).addLinks([link, link]);
		span.setAttributes({ alsoKept: 1, list: ["a"], missing: undefined });
		// OpenTelemetry's API ignores a null, which its types leave out.
		span.setAttribute("absent", null as unknown as string);
		span.end();
	});

	t.deepEqual(spans[0]?.attributes, { alsoKept: 1, kept: "yes", "otel.scope.name": "@opentelemetry/instrumentation-pg", "otel.scope.version": "0.61.0", "service.name": "shop" });
	t.strictEqual(spans[0]?.span.droppedAttributesCount, 2);
	t.strictEqual(spans[0]?.span.droppedEventsCount, 3);
	t.strictEqual(spans[0]?.span.droppedLinksCount, 4);
	t.deepEqual(spans[0]?.span.events, []);
	t.deepEqual(spans[0]?.span.links, []);
});

test("a span's own attribute wins over the Log's context, and the context is read when the span ends", t => {
	const { log, spans } = requestLog({ context: { region: "eu", "service.name": "shop", tenant: "a" } });

	runWithLog(log, () => {
		const span = pgTracer.startSpan("SELECT", { attributes: { tenant: "b" } });

		log.context.user = 7;
		span.end();
	});

	t.deepEqual(spans[0]?.attributes, { "otel.scope.name": "@opentelemetry/instrumentation-pg", "otel.scope.version": "0.61.0", region: "eu", "service.name": "shop", tenant: "b", user: 7 });
});

test("a tracer with no version exports no otel.scope.version", t => {
	const { log, spans } = requestLog({ context: {} });

	runWithLog(log, () => trace.getTracer("my-app").startSpan("work").end());

	t.deepEqual(spans[0]?.attributes, { "otel.scope.name": "my-app" });
});

test("a span is exported once, as it was when it first ended", t => {
	const { log, spans } = requestLog();

	runWithLog(log, () => {
		const span = pgTracer.startSpan("SELECT");

		span.end();
		span.updateName("late").setAttribute("late", true).setStatus({ code: SpanStatusCode.ERROR }).addEvent("late").end();
	});

	t.strictEqual(spans.length, 1);
	t.strictEqual(spans[0]?.span.name, "SELECT");
	t.deepEqual(spans[0]?.span.status, { code: 0 });
	t.strictEqual(spans[0]?.attributes.late, undefined);
	t.strictEqual(spans[0]?.span.droppedEventsCount, 0);
});

test("updateName before the end renames the span", t => {
	const { log, spans } = requestLog();

	runWithLog(log, () => pgTracer.startSpan("query").updateName("SELECT orders").end());

	t.strictEqual(spans[0]?.span.name, "SELECT orders");
});

test("a root span starts a trace of its own, with no parent", t => {
	const { log, spans } = requestLog();

	runWithLog(log, () => pgTracer.startSpan("detached", { root: true }).end());

	t.strictEqual(spans[0]?.span.parentSpanId, undefined);
	t.ok(/^[0-9a-f]{32}$/.test(spans[0]?.span.traceId ?? ""));
	t.notStrictEqual(spans[0]?.span.traceId, log.span.traceId);
});

test("a span that ends after its callback returned, or after its Log ended, is still exported", async t => {
	const { log, spans } = requestLog();
	const span = runWithLog(log, () => pgTracer.startSpan("slow"));

	await log.end();
	span.end();

	t.deepEqual(spans.map(exported => exported.span.name), ["GET /orders", "slow"]);
});

test("a Log with the deprecated otlpQueue and no transports exports the span to that queue", t => {
	const payloads: OtlpPayload[] = [];
	const log = new Log({ context: { "service.name": "shop" }, otlpQueue: { enqueue: payload => { payloads.push(payload); }, flush: () => Promise.resolve() }, stdout: () => {} });

	runWithLog(log, () => pgTracer.startSpan("SELECT").end());

	const exported = payloads.flatMap(payload => "resourceSpans" in payload ? payload.resourceSpans.flatMap(resource => resource.scopeSpans.flatMap(scope => scope.spans)) : []);

	t.deepEqual(exported.map(span => [span.name, span.parentSpanId]), [["SELECT", log.span.spanId]]);
});

test("with no context manager installed, runWithLog still runs the callback and warns once on the Log's stderr", t => {
	const { log, spans, stderr } = requestLog();

	context.disable();
	try {
		t.strictEqual(runWithLog(log, () => {
			pgTracer.startSpan("lost").end();

			return "ran";
		}), "ran");
		runWithLog(log, () => {});
	} finally {
		installContextManager();
	}

	t.deepEqual(spans, []);
	t.strictEqual(stderr.length, 1);
	t.ok(/@larvit\/log: runWithLog found no OpenTelemetry context manager, so no span joins this Log; install one with context\.setGlobalContextManager\(\)/.test(stderr[0] ?? ""));
});
