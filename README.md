# @larvit/log

[![npm](https://img.shields.io/npm/v/@larvit/log)](https://www.npmjs.com/package/@larvit/log)
[![CI](https://github.com/larvit/log/actions/workflows/master.yaml/badge.svg?branch=main)](https://github.com/larvit/log/actions/workflows/master.yaml)

Structured logging with a tiny API, OTLP export of logs and traces, and auto-instrumented HTTP
tracing. No dependencies.

- **Runs anywhere.** Node 18+, Bun, Deno, browsers and React Native. Built on global `fetch`.
- **Just log.** `log.info("msg", { key: "value" })` to stdout/stderr, text or JSON.
- **Traces without an SDK.** Set `otlpHttpBaseURI` and every instance is a span, its logs exported
  with it. OTLP (OpenTelemetry's export protocol) over HTTP, JSON or protobuf.
- **Composable.** Nest instances under a parent, join an upstream trace from a `traceparent` header,
  hand the current context on to any client.
- **HTTP client tracing.** `log.fetch()` is a drop-in `fetch` that records a client span and
  propagates the trace downstream.
- **Zero install weight.** One file, no runtime dependencies.

[Install](#install) · [Log something](#log-something) · [Group logs into a trace](#group-logs-into-a-trace) ·
[Trace outgoing HTTP](#trace-outgoing-http) · [Join an incoming trace](#join-an-incoming-trace) ·
[Accept a logger in your library](#accept-a-logger-in-your-library) · [Options](#options) ·
[Output formats](#output-formats) · [`log.fetch` in depth](#logfetch-in-depth) · [Exports](#exports) ·
[Development](#development) · [Changelog](CHANGELOG.md)

## Install

```bash
npm install @larvit/log
```

Node 18 or later. ESM, types included.

## Log something

```javascript
import { Log } from "@larvit/log";

const log = new Log("silly"); // minimum level to output; default "info"
log.error("Apocalypse! :O"); // stderr
log.warn("The chaos is near"); // stderr
log.info("All is well, but important"); // stdout
log.verbose("Good in a production environment"); // stdout
log.debug("Detailed debugging logs"); // stdout
log.silly("Open the flood gates!"); // stdout
```

Levels, most to least severe: `error`, `warn`, `info`, `verbose`, `debug`, `silly`. `"none"` outputs
nothing.

Keep the message a static string and put every value in the metadata object, so entries with the
same message aggregate in your log backend:

```javascript
log.info("Order placed", { orderId, total: 199, express: true });
// 2022-09-24T23:40:39Z [inf] Order placed {"orderId":"…","total":199,"express":true}
```

Metadata values are `string`, `number` or `boolean`, not `undefined`; drop optional fields before
passing. Keys set in the instance's `context` option are
added to every entry and win over a per-call key of the same name.

## Group logs into a trace

Every `Log` instance is a span. Give it a parent and its span nests under the parent's, joining the
same trace; give it an `otlpHttpBaseURI` and its logs and span are exported there. A span (a timed
unit of work) and its trace (the tree of spans one request produces) are what a tracing backend such
as Grafana Tempo or Jaeger shows.

```javascript
import { Log } from "@larvit/log";

const appLog = new Log({
	context: { "service.name": "foobar" },
	otlpHttpBaseURI: "http://127.0.0.1:4318",
});

async function myRequestHandler(req, res) {
	const reqLog = new Log({
		context: { ...appLog.context, requestId: crypto.randomUUID() },
		parentLog: appLog,
		spanName: "request",
	});

	reqLog.info("Incoming request", { url: req.url });

	// ... request handler logic ...

	await reqLog.end();
}
```

A child inherits every option it does not set itself, `spanName` included. Setting `context` on a
child replaces the parent's rather than merging, hence the spread above. The `service.name` context
key becomes the OTLP resource's service name (default `"unnamed-service"`) rather than a per-entry
attribute. A child's log entries attach to the parent's span; the child's own span holds its
timing and is exported by `end()`.

`end()` closes the span and flushes it and any pending log exports; a span that is never ended is
never sent. `await` it when delivery must complete before the process exits (a short-lived script);
fire-and-forget is fine in a long-running process. Each export request is bounded by a 3 s timeout,
so `await end()` returns within about 6 s against a dead collector, plus however long any
un-awaited `log.fetch()` takes to complete. An instance is single-use:
logging and `fetch()` on an ended instance throw, `end()` rejects.

`log.clone(options?)` (on `Log`, not `LogInt`) makes an independent instance with the same
settings; `context` merges per key, `spanName` is not copied, everything else is overridden as
given. A clone is its own span in a new trace, not a child.

## Trace outgoing HTTP

`log.fetch()` is a drop-in for `fetch()` that records a client span under the log's span and sends
a W3C `traceparent` header unless the request already has one, so the downstream service continues
the trace:

```javascript
const res = await reqLog.fetch("https://api.example.com/users", { method: "POST" });

await reqLog.end(); // delivers the span; the fetch itself never waits on the export
```

Responses, errors and the returned promise behave exactly like plain `fetch`: a failed request
rejects, so await it (or attach `.catch`) whenever the call can fail. Without `otlpHttpBaseURI` it
still injects `traceparent`. Attributes, privacy defaults and edge cases:
[`log.fetch` in depth](#logfetch-in-depth).

## Join an incoming trace

Pass the incoming `traceparent` header to nest under the caller's span. `log.traceparent()` returns
the current context for a client that is not `fetch`:

```javascript
const reqLog = appLog.clone({ spanName: "request", traceparent: req.headers.traceparent });

myClient.send({ headers: { traceparent: reqLog.traceparent() } });
```

`clone()` rather than `parentLog`: when `parentLog` is set, `traceparent` is ignored and the
instance nests under the parent instead. A malformed header is ignored and a fresh trace starts, so
an untrusted header is safe to pass. `traceparent` applies only to the instance it is given to;
children and clones do not inherit it.

## Accept a logger in your library

Take a `Logger` and default to a silent instance, so the consumer decides whether and where your
library logs. `enabled(level)` tells you whether a call at that level would output, so expensive
metadata is built only when it will be seen:

```typescript
import { Log, type Logger } from "@larvit/log";

export function createClient(options: { log?: Logger, settings: Settings }) {
	const log = options.log ?? new Log("none");
	log.debug("createClient() - connecting", { host: options.settings.host });
	if (log.enabled("silly")) {
		log.silly("createClient() - full settings", { settings: JSON.stringify(options.settings) });
	}
}
```

A consumer passes `new Log("debug")`, or a child of their request log so your library's entries land
in their trace.

For a span per operation, take a `LogInt` instead, make a child,
`new Log({ parentLog: log, spanName: "submit_sm" })`, and `end()` that child. It inherits the
consumer's level, sinks and OTLP settings, so a `"none"` consumer stays silent. Never `end()` the
instance you were handed; it is single-use and the consumer owns it.

## Options

`new Log(options)`, `new Log(level)` or `new Log()`. A level string is shorthand for
`{ logLevel: level }`. Every option is optional.

| Option | Type | Default | |
|---|---|---|---|
| `captureQuery` | `boolean` | `false` | `log.fetch` only: keep the query string in `url.full`. Known-sensitive keys such as `Signature` stay redacted. |
| `captureRequestHeaders` | `string[]` | none | `log.fetch` only: request header names to record as `http.request.header.*`. |
| `captureResponseHeaders` | `string[]` | none | `log.fetch` only: response header names to record as `http.response.header.*`. |
| `context` | `Metadata` | `{}` | Added to every entry. Wins over a per-call key of the same name. |
| `entryFormatter` | `(EntryFormatterConf) => string` | text formatter | Formats console output. Use `msTimestamp` rather than `new Date()` so console and OTLP timestamps of one entry match. |
| `format` | `"text" \| "json"` | `"text"` | Console output format. Ignored when `entryFormatter` is set. |
| `logLevel` | `LogLevel \| "none"` | `"info"` | Minimum level to output. |
| `otlpAdditionalHeaders` | `Record<string, string>` | none | Extra headers on every OTLP request, e.g. `{ Authorization: "Bearer …" }`. |
| `otlpHttpBaseURI` | `string` | none | OTLP/HTTP endpoint, e.g. `http://127.0.0.1:4318`. Logs go to `/v1/logs`, spans to `/v1/traces` under it; a base path is kept. A malformed URI throws in the constructor. |
| `otlpProtocol` | `"http/json" \| "http/protobuf"` | `"http/json"` | Wire format. Both use the same endpoint; use protobuf for collectors that reject JSON. |
| `parentLog` | `LogInt` | none | Nest under this instance's span and inherit its options. Log entries attach to the parent's span. |
| `printTraceInfo` | `boolean` | `false` | Append `spanId`, `traceId` and `spanName` to console output. |
| `spanName` | `string` | `"unnamed-span"` | The instance's span name. Inherited from `parentLog` when set there. |
| `stderr` | `(msg: string) => void` | `console.error` | Sink for `error` and `warn`. |
| `stdout` | `(msg: string) => void` | `console.log` | Sink for the other levels. |
| `traceparent` | `string` | none | Incoming W3C `traceparent` to nest under. Ignored when malformed or when `parentLog` is set. |

## Output formats

Text (default). The level is a three-letter tag, `err`/`war`/`inf`/`ver`/`deb`/`sil`, wrapped in
ANSI colour codes; parse `format: "json"` instead of this:

```
2022-09-24T23:40:39Z [inf] Order placed {"orderId":"…","total":199}
```

JSON (`format: "json"`), one object per line. `logLevel`, `msg` and `time` win over metadata keys of
the same name:

```json
{"orderId":"…","total":199,"logLevel":"info","msg":"Order placed","time":"2022-09-24T23:40:39.123Z"}
```

OTLP receives every metadata value as a string (`{ total: 199 }` → `"199"`); the JSON formatter
keeps it native. Levels map to OTLP severity through the exported `LogLevels` table.

## `log.fetch` in depth

Input is a `string` or `URL`. A relative URL with no base (Node) passes straight through to an
untraced `fetch`. The span is the only output; no log line is written.

Span attributes follow the OpenTelemetry HTTP semantic conventions:

| Attribute | Value |
|---|---|
| `http.request.method` | Request method, `GET` when unset |
| `url.full` | The URL without userinfo. Query string dropped unless `captureQuery` |
| `url.scheme`, `server.address`, `server.port` | From the URL; port only when explicit |
| `http.request.header.<name>` | Headers listed in `captureRequestHeaders` |
| `http.response.status_code` | Response status |
| `http.response.header.<name>` | Headers listed in `captureResponseHeaders` |
| `error.type` | On a thrown error: its `code`, else `name`, else `"fetch_error"` |

A 4xx/5xx response or a thrown error marks the span errored; the response or error reaches the
caller unchanged. Bodies are never captured. `captureQuery` and the header allow-lists are read at
call time from the instance; `clone()` to vary them per call site.

Spans export in the background and are registered with `end()` at call time, so `await log.end()`
delivers a `log.fetch()` you never awaited.

## Exports

| Export | |
|---|---|
| `Log` | The logger class. |
| `LogLevels` | Level → OTLP `severityNumber`/`severityText`, most to least severe. |
| `msgTextFormatter`, `msgJsonFormatter` | The built-in `entryFormatter`s; wrap one to extend it. |
| `parseTraceparent(header)` | `{ traceId, spanId, flags }` or `null` when malformed. |
| `formatTraceparent(traceId, spanId, sampled?)` | Builds a W3C `traceparent` header value. |
| `generateTraceId()`, `generateSpanId()` | Random 32- and 16-hex-char ids. |
| `Logger` | The six level methods and `enabled(level)`. Accept this in library code. |
| `LogInt` | `Logger` plus `fetch`, `traceparent`, `end`, `conf`, `span`. What `parentLog` takes. |
| `LogConf`, `ResolvedLogConf` | The options object; `ResolvedLogConf` is `log.conf` with defaults applied. |
| `LogLevel`, `LogShorthand` | Level name union; the signature of one level method. |
| `Metadata`, `MetadataValue` | `Record<string, string \| number \| boolean>` and its value type. |
| `EntryFormatterConf` | The argument to `entryFormatter`. |
| `OtlpSpan`, `OtlpAttribute`, `OtlpLogPayload`, `OtlpSpanPayload` | The OTLP wire shapes; `log.span` is an `OtlpSpan`. |

Instance fields: `log.conf`, `log.context`, `log.span`, `log.ended`.

## Development

Everything runs in Docker with dependencies installed in the container, so no local `npm install`.
`npm run lint` is the exception: it needs Node 20+ and `npm ci` on the host.

| Command | |
|---|---|
| `npm test` | Node and browser suites. |
| `npm run test-docker` | Node suite. `NODE_IMAGE=node:18-bookworm-slim npm run test-docker` picks the version; CI runs 18 to 26. |
| `npm run test-browser` | The same suite in Chromium. |
| `npm run test-otlp` | Export to a real OpenTelemetry Collector, JSON and protobuf. `OTLP_DEBUG=1` prints what it received. |
| `npm run lint` | eslint. |

### Releasing

A published GitHub release runs `.github/workflows/publish.yaml`: build, test, lint, `npm publish`.
It needs an `NPM_TOKEN` repository secret (an npm automation token with publish rights).

1. Add the version to [CHANGELOG.md](CHANGELOG.md).
2. `npm version <major|minor|patch>`. Breaking changes bump the major.
3. Merge to `main` through a PR.
4. Create a GitHub release with tag `vX.Y.Z` matching `package.json`; the workflow fails when they differ.

`npm run build-and-publish` publishes from the host instead.
