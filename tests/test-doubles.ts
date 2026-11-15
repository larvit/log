import { buildSpanPayload } from "../otlp/payloads.js";
import { type FetchTrace, traceFetch } from "../tracing/fetch.js";
import { Log, type LogOptions, type Metadata, type OtlpQueue, type QueueStorage, type TimerHandle } from "../index.js";
import { openSpan } from "../tracing/spans.js";

// Resolves after one macrotask, so every callback of an already settled promise runs first. It uses
// no timer, so a test never waits on the wall clock.
export function nextTurn(): Promise<void> {
	return new Promise(resolve => {
		const channel = new MessageChannel();

		channel.port1.onmessage = () => {
			channel.port1.close();
			resolve();
		};
		channel.port2.postMessage(undefined);
	});
}

// Bounded by turns, so a condition only a real timer can make true fails here instead of passing slowly.
export const WAIT_FOR_TURNS = 1000;

export async function waitFor(done: () => boolean): Promise<void> {
	for (let turn = 0; !done(); turn++) {
		if (turn === WAIT_FOR_TURNS) {
			throw new Error("waitFor: the condition never held");
		}

		await nextTurn();
	}
}

// The message of what `construct` throws, or "" when it does not.
export function thrown(construct: () => void): string {
	try {
		construct();

		return "";
	} catch (err) {
		return String(err);
	}
}

// Runs `body` with each named global replaced, then puts the originals back. Never replace `location`:
// in a browser, setting it navigates away.
export function withGlobals(globals: Record<string, unknown>, body: () => void): void {
	const originals = Object.keys(globals).map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);

	for (const [name, value] of Object.entries(globals)) {
		Reflect.set(globalThis, name, value);
	}

	try {
		body();
	} finally {
		for (const [name, descriptor] of originals) {
			if (descriptor) {
				Object.defineProperty(globalThis, name, descriptor);
			} else {
				Reflect.deleteProperty(globalThis, name);
			}
		}
	}
}

// A queue's report sink, flattened to one object per line for deepEqual.
export function reportSink() {
	const lines: Metadata[] = [];

	return { lines, report: (msg: string, metadata: Metadata) => { lines.push({ msg, ...metadata }); } };
}

// In-memory QueueStorage. `async` mimics AsyncStorage (promises); sync mimics localStorage.
export function fakeStorage(async: boolean): QueueStorage & { data: Map<string, string> } {
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

// The log record bodies a storage holds under the default key, in stored order.
export function storedRecords(storage: { data: Map<string, string> }): string[] {
	const payloads: any[] = JSON.parse(storage.data.get("@larvit/log:otlp-queue") ?? "[]");

	return payloads.flatMap(payload => payload.resourceLogs?.flatMap((resourceLog: any) => resourceLog.scopeLogs.flatMap((scopeLog: any) => scopeLog.logRecords.map((rec: any) => rec.body.stringValue))) ?? []);
}

// The OTLP nanosecond spelling of a millisecond instant; ns overflows Number, so build the string.
export const nanos = (msTimestamp: number) => `${msTimestamp}000000`;

// A Clock the test drives: `now` moves only in advance(), which fires every timer that comes due.
export function fakeClock(startMs = 1758150000000) {
	const timers = new Map<number, { callback: () => void, dueAt: number }>();
	let now = startMs;
	let nextTimer = 1;

	// The queue's awaited work is promises all the way down, so one turn drains it.
	const settle = nextTurn;

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
export function capture(conf?: ConstructorParameters<typeof Log>[0]) {
	const stderr: string[] = [];
	const stdout: string[] = [];
	const opts: LogOptions = typeof conf === "object" ? { ...conf } : { logLevel: conf };

	opts.stderr = line => { stderr.push(line); };
	opts.stdout = line => { stdout.push(line); };

	return { log: new Log(opts), stderr, stdout };
}

// A minimal fetch Response stand-in. Defaults satisfy the OTLP transport (which reads .json());
// log.fetch tests override status/headers — log.fetch never reads the body.
export function response({ headers, json = { partialSuccess: {} }, status = 200 }: { headers?: Headers, json?: unknown, status?: number } = {}) {
	// eslint-disable-next-line id-length -- "ok" mirrors the fetch Response shape
	return { headers: headers ?? new Headers(), json: () => Promise.resolve(json), ok: status < 400, status };
}

export type StubResponse = ReturnType<typeof response>;

type Responder = (path: string, body: unknown) => StubResponse | Promise<StubResponse | undefined> | undefined;

type RecordedCall = { body: any, contentType: string | null, headers: any, keepalive: unknown, method?: string, path: string, rawBody: any, url: string };

// A fetch that records each call in `calls` and answers with `responder`'s response, else a 200.
export function recordingFetch(calls: RecordedCall[], responder?: Responder): typeof fetch {
	return (async (url: string, init: { body?: any, headers?: HeadersInit, keepalive?: boolean, method?: string } = {}) => {
		const contentType = new Headers(init.headers ?? {}).get("Content-Type");
		const path = new URL(String(url)).pathname;
		// Only JSON bodies are parsed; protobuf bodies are raw bytes, inspected via rawBody.
		const body = init.body !== undefined && contentType === "application/json" ? JSON.parse(init.body) : undefined;

		calls.push({ body, contentType, headers: init.headers, keepalive: init.keepalive, method: init.method, path, rawBody: init.body, url: String(url) });

		return await responder?.(path, body) ?? response();
	}) as unknown as typeof fetch;
}

// Replace global fetch with a recording stub (Node + browser), so the OTLP transport is asserted
// without a real server. The harness restores globalThis.fetch after each test.
export function stubFetch(responder?: Responder) {
	const calls: RecordedCall[] = [];

	globalThis.fetch = recordingFetch(calls, responder);

	return { calls };
}

// What log.fetch's tracing reads of a Log, for testing it without one. Its `fetch` and its queue both record into
// `calls`: each request as stubFetch does, and each span payload as the /v1/traces call a Log's queue would send, so
// `clientSpan(calls)` finds it. `warnings` holds what `warn` was handed. `logFetch` runs traceFetch on this trace.
export function testFetchTrace(over: Partial<FetchTrace> = {}, responder?: Responder) {
	const calls: RecordedCall[] = [];
	const warnings: string[] = [];
	const clock = { clearTimeout: () => {}, now: () => 1700000000000, setTimeout: () => 1 };
	let draws = 0;
	// A fresh fill per draw, so a child span's id differs from its parent's.
	const randomBytes = (size: number) => new Uint8Array(size).fill(++draws);
	const { sampled, span } = openSpan({ clock, randomBytes });
	const otlpQueue: OtlpQueue = {
		enqueue: payload => {
			const body = JSON.parse(JSON.stringify(payload));

			calls.push({ body, contentType: "application/json", headers: {}, keepalive: undefined, path: "/v1/traces", rawBody: undefined, url: "http://127.0.0.1:4318/v1/traces" });
		},
		flush: async () => {},
	};
	const trace: FetchTrace = {
		clock,
		context: { "service.name": "svc" },
		fetch: recordingFetch(calls, responder),
		randomBytes,
		sampled,
		span,
		transports: [{ span: ended => { otlpQueue.enqueue(buildSpanPayload(ended)); } }],
		warn: msg => { warnings.push(msg); },
		...over,
	};

	// Calls traceFetch as Log.fetch does, with a `track` that ignores the promise, since this trace's queue needs no flush.
	const logFetch = (input: string | URL, init?: RequestInit) => traceFetch(trace, input, init, () => {});

	return { calls, logFetch, trace, warnings };
}

// Read a header from a recorded call, normalising plain-object and Headers shapes.
export const callHeader = (call: { headers: any }, name: string) => new Headers(call.headers ?? {}).get(name);

// Every span in every /v1/traces call, in export order, across all resource and scope groups.
export function exportedSpans(calls: { body: any, path: string }[]): any[] {
	return calls.filter(call => call.path === "/v1/traces").flatMap(call => call.body.resourceSpans.flatMap((resourceSpan: any) => resourceSpan.scopeSpans.flatMap((scopeSpan: any) => scopeSpan.spans)));
}

// Log record bodies in every /v1/logs call, in export order, across all resource and scope groups.
export function exportedRecords(calls: { body: any, path: string }[]): string[] {
	return calls.filter(call => call.path === "/v1/logs").flatMap(call => call.body.resourceLogs.flatMap((resourceLog: any) => resourceLog.scopeLogs.flatMap((scopeLog: any) => scopeLog.logRecords.map((rec: any) => rec.body.stringValue))));
}

// The exported CLIENT span (kind 3) — the one log.fetch creates.
export function clientSpan(calls: { body: any, path: string }[]) {
	const span = exportedSpans(calls).find(span => span.kind === 3);

	if (!span) {
		throw new Error("no client span was exported");
	}

	return span;
}
