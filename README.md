# @larvit/log

Structured logging with a simple interface, OTLP export, and auto-instrumented HTTP tracing.

## Design priorities

In priority order:

1. **Works everywhere** — Node.js, Bun, Deno and other server runtimes, plus browsers and React Native. Built on the common JS surface (global `fetch`), with fallbacks where a runtime lacks an API.
2. **A very easy API** — "just log" stays trivial; no need to learn OTLP internals.
3. **Composable** — inherit context/spans/traces between instances and attach to upstream headers/spans/traces. A chameleon that slots into most setups.
4. **Low footprint for the consumer** — small runtime cost and install weight. This library's own build/codegen steps are fine as long as they don't reach consumers.

## Installation

`npm i @larvit/log`

## Usage

```javascript
import { Log } from "@larvit/log";

const log = new Log("silly"); // minimum level to output; defaults to "info"
log.error("Apocalypse! :O"); // stderr
log.warn("The chaos is near"); // stderr
log.info("All is well, but important"); // stdout
log.verbose("Good in a production environment"); // stdout
log.debug("Detailed debugging logs"); // stdout
log.silly("Open the flood gates!"); // stdout
```

Clone an instance: `const log2 = log.clone();`.

### Group your logs

For tracing, timings and spans, group logs under a parent:

```javascript
import { Log } from "@larvit/log";

const appLog = new Log({ context: { "service.name": "foobar" } });

async function myRequestHandler(req, res) {
	// Inner context for this specific request
	const reqLog = new Log({
		context: { requestId: crypto.randomUUID() },
		parentLog: appLog,
		spanName: "request",
	});

	reqLog.info("Incoming request", { url: req.url });

	// ... request handler logic ...

	// Ends the span/trace and flushes them (without end() they are never sent). Await when you
	// need delivery before the process exits (short-lived scripts); fire-and-forget is fine in
	// long-running processes.
	await reqLog.end();
}
```

### Trace outgoing HTTP calls

`log.fetch()` is a drop-in for `fetch()` that creates an OpenTelemetry **client span** (nested under
the log's span) and injects a W3C `traceparent` header, so the downstream service continues the trace:

```javascript
const reqLog = new Log({ otlpHttpBaseURI: "http://127.0.0.1:4318", parentLog: appLog });

const res = await reqLog.fetch("https://api.example.com/users", { method: "POST" });

await reqLog.end(); // flushes the spans (the fetch itself never waits on the OTLP export)
```

It records the OTel HTTP semantic-convention attributes (`http.request.method`, `url.full`,
`url.scheme`, `server.address`/`server.port`, `http.response.status_code`, and `error.type` on
failure — its `code`, else `name`, else `"fetch_error"`). 4xx/5xx and thrown network errors
(re-thrown unchanged) mark the span errored; the call's result is never altered.

Notes:

- **The span is the only output** — no log line. Without `otlpHttpBaseURI` it only injects the
  `traceparent` header (downstream still continues the trace).
- **Delivery:** spans export in the background, so the call returns as soon as the response is ready.
  `await log.end()` delivers every span, including a fire-and-forget `log.fetch()` you never awaited.
- **Errors:** an un-awaited `log.fetch()` surfaces a failed request as an unhandled rejection, exactly
  like plain `fetch`. Await it (or attach `.catch`) whenever the call can fail.
- **Inputs:** only `string` and `URL` are traced. A `Request`, or a relative URL with no base (e.g. in
  Node), passes straight through to a plain, untraced `fetch`.

**Privacy:** the query string is **dropped** from `url.full` by default (it may carry tokens) and
userinfo is always stripped. Opt in with `captureQuery: true` (known-sensitive keys like `Signature`
are still redacted). Headers are captured only when allow-listed via `captureRequestHeaders` /
`captureResponseHeaders`; bodies are never captured. These three are instance-wide (read at call time);
`clone()` to vary them.

### Continue a trace from an incoming request

Pass the incoming `traceparent` header to join an upstream trace (nesting under the caller's span).
Read it back with `log.traceparent()` to propagate to a non-fetch client:

```javascript
const reqLog = new Log({ traceparent: req.headers.traceparent });
// ...later, calling another client:
myClient.send({ headers: { traceparent: reqLog.traceparent() } });
```

A malformed `traceparent` is ignored (a fresh trace starts), so passing an untrusted header is safe.

### Configuration

**Log level only:** `new Log("info")` outputs error/warn/info. Levels: `"error"`, `"warn"`, `"info"`,
`"verbose"`, `"debug"`, `"silly"`, `"none"`. Default `"info"`.

**All options** (all optional):

```javascript
const log = new Log({
	// log.fetch only: include the URL query string on the span (sensitive keys still redacted).
	// Default false. Added in 2.3.0
	captureQuery: false,

	// log.fetch only: header-name allow-lists, recorded as http.request.header.* /
	// http.response.header.*. Default none. Instance-wide; clone() to vary. Added in 2.3.0
	captureRequestHeaders: ["x-request-id"],
	captureResponseHeaders: ["x-request-id"],

	// Appended as metadata to every log entry. Default {}
	context: { key: "string", anotherKey: "string" },

	// "text" (default) or "json"
	format: "text",

	// Default "info", same as the log-level-only form above
	logLevel: "info",

	// Formats the log entry; default shown. msTimestamp is the Date.now() of the log call (use it
	// instead of new Date() so the console, json and OTLP timestamps for one entry all match).
	entryFormatter: ({ logLevel, metadata, msTimestamp, msg }) => {
		return `${logLevel}: ${msg} ${JSON.stringify(metadata)}`;
	},

	// Extra OTLP HTTP headers, eg. { Authorization: "Bearer xxx" }. Default null. Added in 1.4.0
	otlpAdditionalHeaders: null,

	// OTLP HTTP endpoint for spans/traces/logs, eg. http://127.0.0.1:4318. Default null. Added in 1.3.0
	otlpHttpBaseURI: null,

	// OTLP wire format: "http/json" (default) or "http/protobuf" (same endpoint, Content-Type
	// application/x-protobuf). Use protobuf for collectors that reject JSON. Added in 2.2.0
	otlpProtocol: "http/json",

	// Group logs under a parent (spans/traces). Default null (no span). Added in 1.3.0
	parentLog: new Log(),

	// Append spanName/spanId/traceId to console output. Default false. Added in 1.3.0
	printTraceInfo: false,

	// Incoming W3C traceparent to adopt (join that trace, nest under its span). Ignored if malformed
	// or if parentLog is set. Added in 2.3.0
	traceparent: null,

	// Span name; logs using this log as parent group under it. Defaults to the generated span id.
	spanName: "my-span",

	// Writes silly/debug/verbose/info. Default console.log
	stdout: console.log,

	// Writes error/warn. Default console.error
	stderr: console.error,
});
```

### Metadata

`log.info("foo", { hey: "luring" })` → `2022-09-24T23:40:39Z [info] foo {"hey":"luring"}`

Values may be `string`, `number`, or `boolean`. OTLP attributes are string-only, so `{ count: 5 }`
is sent as `"5"`; the JSON formatter keeps it native (`5`).

## Testing

All tests run in Docker (dependencies installed in the container too), so a local run matches CI.
Requires Docker; no local `npm install` needed.

- `npm test` — everything: the Node and browser suites.
- `npm run test-docker` — Node suite only. Override the version with
  `NODE_IMAGE=node:18-bookworm-slim npm run test-docker` (CI runs the full 18–26 matrix this way).
- `npm run test-browser` — the same suite in real Chromium (official Playwright image).
- `npm run test-otlp` — end-to-end export to a pinned OpenTelemetry Collector, asserting it parsed
  both the JSON **and** protobuf output (validates the hand-built protobuf encoder against the
  reference, not just our own decoder). `OTLP_DEBUG=1` dumps what the collector received. See
  `scripts/run-otlp-tests.mjs`. Needs only Docker.
- `npm run lint` — eslint over the sources. Needs Node 20+ (eslint 10) and deps installed locally, so
  CI runs it in its own job rather than inside the Node test matrix.

The suite is runtime-agnostic: it injects `stdout`/`stderr` and stubs the global `fetch`, so the same
tests cover console output and OTLP in Node and the browser. The container runs `npm run ci` /
`ci-browser` internally.

## Releasing

Publishing is automated: creating a GitHub release runs the **Publish** workflow
(`.github/workflows/publish.yaml`) — build, test, lint, then `npm publish`.

One-time setup: add an `NPM_TOKEN` repo secret (Settings → Secrets and variables → Actions) — an npm
automation token with publish rights to `@larvit/log`.

To cut a release:

1. Add a `## Changelog` entry below for the new version.
2. Bump the version in `package.json` (`npm version <major|minor|patch>` does this and commits).
   Follow semver: breaking changes → major.
3. Merge to `master`.
4. Create a GitHub release with a tag `vX.Y.Z` that matches `package.json` (the workflow verifies the
   tag matches the version and fails the publish otherwise).

To publish manually instead: `npm run build-and-publish`.

## Changelog

### v2.3.0

- **Auto-instrumented HTTP client.** New `log.fetch(input, init?)` — a drop-in for `fetch` that
  creates an OTel **client span** for the call (nested under the log's span), injects a W3C
  `traceparent` header, and records the HTTP semantic-convention attributes. The query string is
  dropped from `url.full` by default (opt in with `captureQuery`); headers are captured only via the
  `captureRequestHeaders`/`captureResponseHeaders` allow-lists; bodies are never captured. 4xx/5xx and
  thrown errors (re-thrown unchanged) mark the span errored. Spans export in the background and flush
  on `end()`, so the fetch never waits on the OTLP round-trip.
- **W3C trace-context propagation.** New `traceparent` option to adopt an incoming trace (join it and
  nest under its span; malformed values are ignored) and `log.traceparent()` to emit the current
  context for non-fetch clients. New exported helpers `parseTraceparent`/`formatTraceparent`.
- Still dependency-free and runtime-agnostic — built on global `fetch`/`Headers`/`URL`.

### v2.2.0

- OTLP can now export over **HTTP/protobuf**, not only HTTP/JSON. Opt in with
  `otlpProtocol: "http/protobuf"` (default stays `"http/json"`); both POST to the same endpoint.
  The protobuf encoder is hand-built and dependency-free, so the library stays a single
  self-contained file that runs anywhere. Useful for collectors that only accept protobuf.
- Fixed: `clone()` now inherits OTLP settings (`otlpHttpBaseURI`, `otlpProtocol`,
  `otlpAdditionalHeaders`) and `printTraceInfo`, which it previously dropped silently. A clone still
  gets its own span — it is not made a child of the original.

### v2.1.0

- `Metadata` values may now be `number` or `boolean`, not only `string` (new exported `MetadataValue`
  type). OTLP attributes receive the stringified form (`{ count: 5 }` → `"5"`); the JSON formatter
  keeps them native (`5`).
- Browsers are now a **tested** target: the suite runs in real Chromium (Playwright in Docker) in
  CI, alongside the Node matrix. No library/runtime behaviour change — the code was already
  browser-safe (global `fetch`, `crypto.getRandomValues` with a fallback, `AbortController`).
- Added package `exports` map, `types` and `sideEffects: false` for cleaner bundler/CDN resolution.
- Test tooling: replaced `tape`/`tap-spec`/`express`/`ts-node` with a tiny built-in TAP harness and
  a `fetch` stub, compiled by the existing `tsc` pipeline (no bundler added). `npm install` now pins
  exact versions (`save-exact`).
- All tests (Node + browser) now run inside Docker with deps installed in the container, so local
  runs match CI exactly. See [Testing](#testing).

### v2.0.0

- **Breaking:** requires Node.js >= 18 (dropped 16/17). The OTLP transport uses the global `fetch`.
- **Breaking:** removed the unused OTLP options `otlpExportTimeoutMillis`, `otlpMaxExportBatchSize`, `otlpMaxQueueSize`, `otlpScheduledDelayMillis`.
- `end()` now returns a `Promise` — `await log.end()` to guarantee delivery before exit (fire-and-forget still works).
- Fixed: OTLP logs now set `service.name` (and `telemetry.sdk.*`) on the resource, so Grafana/Loki shows the service for logs, not only traces.
- Fixed: a base path in `otlpHttpBaseURI` is now kept (e.g. `http://host/otel` → `http://host/otel/v1/logs`).
- Implemented `printTraceInfo` (appends `spanId`/`traceId`/`spanName` to console output; previously a no-op).
- Span/trace IDs use `crypto.getRandomValues` when available; `msgJsonFormatter` no longer mutates caller metadata or throws on undefined metadata; corrected inverted `verbose`/`debug` severity ordering.
- Tooling: switched from yarn to npm.
