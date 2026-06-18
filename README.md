# @larvit/log

Structured logging with a simple interface and support for OTLP.

## Design priorities

In priority order:

1. **A simple API** — small surface, easy to drop in.
2. **Runs anywhere JavaScript runs** — both browsers and server-side (Node.js >= 18). The only requirement is a runtime with the global `fetch` (used by the OTLP transport).
3. **Strong OTLP support** — the OTLP payloads are hand-built JSON over `fetch` (no OpenTelemetry SDK dependency) to stay portable across runtimes.
4. **stdout/stderr support** — works as a plain console logger when OTLP is not configured.

## Installation

`npm i @larvit/log` or `yarn add @larvit/log`

## Usage

```javascript
import { Log } from "@larvit/log";

const log = new Log("silly"); // Replace "silly" with the minimum log level you want. Defaults to "info"
log.error("Apocalypse! :O"); // stderr
log.warn("The chaos is near"); // stderr
log.info("All is well, but this message is important"); // stdout
log.verbose("Extra info, likely good in a production environment"); // stdout
log.debug("A lot of detailed logs to debug your application"); // stdout
log.silly("Open the flood gates!"); // stdout
```

To clone your log instance: `const log2 = log.clone();`.

### Group your logs

To get tracing, timings, spans etc you can group your logs like this example:

```javascript
import { Log } from "@larvit/log";

// Creates an outer log context
const appLog = new Log({
	context: {
		"service.name": "foobar"
	}
});

// Just an example on a request/response http handler that you want to log
async function myRequestHandler(req, res) {
	// Creates an inner log context for this specific request
	const reqLog = new Log({
		context: { requestId: crypto.randomUUID() },
		parentLog: appLog,
		spanName: "request",
	});

	reqLog.info("Incoming request", { url: req.url });

	// ... Here be loads of request handler logic ...

	// Explicitly tell that this inner log is now ended.
	// Without this spans and traces does not get sent.
	// end() returns a promise; await it when you need delivery guaranteed
	// before the process exits (eg. short-lived scripts). Fire-and-forget
	// (just `reqLog.end();`) is fine in long-running processes.
	await reqLog.end();
}

```

### Configuration

**Log level only**
`const log = new Log("info");` Will only output error, warn and info logs. This is the default. All possible options: "error", "warn", "info", "verbose", "debug", "silly" and "none".

**All options**
```javascript
const log = new Log({
	// All options is optional

	// Context will be appended as metadata to all log entries
	// Default is an empty context
	context: {
		key: "string",
		anotherKey: "string",
	},

	// Options are "text" and "json", "text" is the default
	format: "text",

	// Defaults to "info", same as Log level only section above
	logLevel: "info",

	// The function that formats the log entry, default is shown here.
	// msTimestamp is the Date.now() of the log call (use it instead of new Date()
	// so the console, json and OTLP timestamps for one entry all match).
	entryFormatter: ({ logLevel, metadata, msTimestamp, msg }) => {
		return `${logLevel}: ${msg} ${JSON.stringify(metadata)}`;
	},

	// Open Telemetry additional http headers
	// For example:
	// { Authorization: "Bearer xxx" }
	// Defaults to null
	// Added in 1.4.0
	otlpAdditionalHeaders: null,

	// Open Telemetry http endpoint to send spans, traces and logs to.
	// For example http://127.0.0.1:4318
	// Defaults to null
	// Added in 1.3.0
	otlpHttpBaseURI: null,

	// Group logs together under a specific parent
	// Used for spans and traces in Open Telemetry etc.
	// Defaults to null, creating no span in otlp
	// Added in 1.3.0
	parentLog: new Log(),

	// If set to true, append spanName, spanId and traceId to the context output
	// Defaults to false
	// Added in 1.3.0
	printTraceInfo: false,

	// Use a specific span name. Any log using this log as a parent will be
	// grouped under this span name.
	// Defaults to be the same as the span id, that is internally generated for each span
	spanName: "my-span",

	// Function that will be called to write log levels silly, debug, verbose and info.
	// Defaults to console.log
	stdout: console.log,

	// Function that will be called to write log levels error and warn.
	// Defaults to console.error
	stderr: console.error,
});
```

### Metadata

`log.info("foo", { hey: "luring" });` --> 2022-09-24T23:40:39Z [info] foo {"hey":"luring"}

## Testing

All tests run inside Docker — dependencies are installed in the container too — so a local run is
identical to CI. Requires Docker; no local `npm install` is needed to run them.

- `npm test` — runs everything: the Node suite and the browser suite.
- `npm run test-docker` — Node suite only. Override the Node version with
  `NODE_IMAGE=node:18-bookworm-slim npm run test-docker` (CI runs the full 18–26 matrix this way).
- `npm run test-browser` — the same suite in real Chromium via the official Playwright image.

The suite is runtime-agnostic: it injects `stdout`/`stderr` and stubs the global `fetch`, so the
exact same tests exercise the console output and the OTLP transport in Node and in the browser.
The container runs `npm run ci` / `ci-browser` internally — run those directly only if you already
have deps installed locally.

## Releasing

Publishing is automated: creating a GitHub release runs the **Publish** workflow
(`.github/workflows/publish.yaml`), which builds, tests, lints and then `npm publish`es.

One-time setup: add an `NPM_TOKEN` repo secret (Settings → Secrets and variables → Actions)
with an npm automation token that has publish rights to `@larvit/log`.

To cut a release:

1. Add a `## Changelog` entry below for the new version.
2. Bump the version in `package.json` (`npm version <major|minor|patch>` does this and commits it).
   Follow semver: breaking changes → major.
3. Merge to `master`.
4. Create a GitHub release with a tag `vX.Y.Z` that matches `package.json` (e.g. `v2.0.0`).
   The workflow verifies the tag matches the version and fails the publish if it does not.

The workflow publishes whatever is in `package.json`, so the tag and `package.json` version must agree.
To publish manually instead: `npm run build-and-publish`.

## Changelog

### Unreleased

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
