# @larvit/log

[![npm](https://img.shields.io/npm/v/@larvit/log)](https://www.npmjs.com/package/@larvit/log)
[![bundle size](https://deno.bundlejs.com/badge?q=@larvit/log)](https://bundlejs.com/?q=%40larvit%2Flog)
[![CI](https://github.com/larvit/log/actions/workflows/push.yaml/badge.svg?branch=main)](https://github.com/larvit/log/actions/workflows/push.yaml)

Structured logging with a tiny API, plus OTLP export of logs and traces from Node, Bun, Deno,
browsers and React Native. No OpenTelemetry SDK, no dependencies.

- **One built file, every runtime.** It uses the global `fetch`, so a browser and a React Native
  app export the same way a server does. No SDK, no bundler config, no native module. The opt-in
  [OpenTelemetry adapter](#export-what-opentelemetry-instrumentation-records) is a second file,
  loaded only by an app that imports it.
- **Exports survive a restart.** Entries and spans are batched and retried with backoff; give the
  queue a storage and an offline phone holds them until the network is back.
- **Just log.** `log.info("msg", { key: "value" })` to stdout/stderr, text or JSON.
- **Traces without an SDK.** Add `otlpTransport` and every instance is a span, its logs exported
  with it. OTLP (OpenTelemetry's export protocol) over HTTP, JSON or protobuf.
- **HTTP client tracing.** `log.fetch()` is a drop-in `fetch` that records a client span and
  propagates the trace downstream.
- **Database and queue spans from OpenTelemetry's instrumentation.** `@larvit/log/otel` exports what
  packages such as `@opentelemetry/instrumentation-pg` record, nested under the request's span.
- **Composable.** Nest instances under a parent, join an upstream trace from a `traceparent` header,
  hand the current context on to any client.

[Goals](#goals) · [Audience](#audience) · [Install](#install) · [Log something](#log-something) ·
[Group logs into a trace](#group-logs-into-a-trace) ·
[Trace outgoing HTTP](#trace-outgoing-http) · [Join an incoming trace](#join-an-incoming-trace) ·
[Export what OpenTelemetry instrumentation records](#export-what-opentelemetry-instrumentation-records) ·
[Transports](#transports) · [Queue exports](#queue-exports) ·
[Accept a logger in your library](#accept-a-logger-in-your-library) ·
[Options](#options) · [Output formats](#output-formats) · [`log.fetch` in depth](#logfetch-in-depth) ·
[Footprint](#footprint) · [Exports](#exports) ·
[Development](#development) · [Changelog](CHANGELOG.md)

## Goals

Achieve goals come first, in priority order: each is a direction, weighed against the others, and the
earlier one wins a tie. Maintain goals follow: each is a state every change holds, whatever it does
for an achieve goal, and where two conflict the earlier one wins.

1. **Achieve:** **Simple to use, easy to follow.** Sane defaults, and you can see what a call does by
   reading it.
   - Signal: you can tell what a call uses from the call itself and the logger it's made on, and the
     README's examples for common tasks get shorter.
   - Counter-signal: an option does something you wouldn't guess from its name, or a default
     surprises someone.
   - Why: an API that only looks simple because it hides where things come from is easy to call but
     hard to debug.
2. **Achieve:** **The logger you reach for first.** Useful with no config, and enough for most apps
   without a second logging or tracing library.
   - Signal: fewer common needs send a user to a second library, such as pino, winston or the
     OpenTelemetry SDK.
   - Counter-signal: the bundle size or the number of documented options grows.
   - Why: breadth bought with a larger surface stops it being the easy default.
3. **Achieve:** **Runs everywhere.** Node, Bun, Deno, browsers and React Native.
   - Signal: CI proves more of these runtimes, and none needs setup of its own.
   - Counter-signal: code that branches on the runtime grows.
   - Why: support bought with per-runtime branches drifts apart, runtime by runtime.
   1. **Achieve:** **Behaves the same everywhere,** except where a runtime genuinely differs: then the
      platform wins and the docs say so.
      - Signal: fewer tests skip or branch on the runtime they run in.
      - Counter-signal: code emulates on one runtime what its platform does differently.
      - Why: sameness forced against the platform surprises that platform's users.
4. **Achieve:** **Composable.** Instances nest, inherit, attach to an upstream trace, and send to
   any set of destinations.
   - Signal: an app or a library combines instances and traces with no glue code of its own.
   - Counter-signal: a feature works at one level of nesting only.
   - Why: composition that stops at one level pushes the glue back onto the user.
5. **Achieve:** **[Low footprint](#footprint).**
   - Signal: the budgets in README → Footprint hold, or tighten.
   - Counter-signal: a common need is left to user code to save bytes.
   - Why: a footprint kept small by pushing work onto users only moves the cost.
6. **Maintain:** **Correct OTLP.** Leave out what cannot be done to the spec.
7. **Maintain:** **[Credentials never leave](#credentials-in-a-captured-value)** in the shapes that
   section lists. Text you log, and a url encoded other than by percent-encoding, such as base64,
   are exported as written.
8. **Maintain:** **[Semver, read strictly](#audience).**
9. **Maintain:** **Never holds a process open** past the work the app asked for.
10. **Maintain:** **No hidden global context.** A logger uses only what you give it, through its
    options or its parent. The one exception is the opt-in OpenTelemetry adapter, which has to talk
    to OpenTelemetry's global API.

## Audience

Public npm consumers. Three readers, in order:

1. **The app developer** wiring logs and traces into a service or an app.
2. **The library author** accepting a `Logger` from their consumer.
3. **The person reading the telemetry** in Grafana, Tempo or Loki, who never installs the package
   and is who span names and attribute shapes are for.

A mobile app on cellular with offline periods is a primary target, equal to a server: the export
queue survives app restarts through a `storage` adapter, and a full one holds about 1.1 MiB.

**Runtimes.** Anything with a parser that takes `?.` and working global `fetch`, `TextEncoder`,
`btoa`, `BigInt`, `URL` and `URLSearchParams`. In a browser that means Chrome 80, Firefox 74 or
Safari 14, or newer; an older one throws a `SyntaxError` loading `index.js`. CI proves Node 18
to 26 and current Chromium. React Native is supported from 0.74, where Hermes gained `TextEncoder`
and `btoa`. Its own `URL` and `URLSearchParams` throw "not implemented" from members this package
reads, so an app that doesn't already replace them installs a polyfill, such as
`react-native-url-polyfill`, before its code uses this package. Deno and Bun meet the rule and are
not in CI.

**Rely on** what this README documents outside Goals, under semver read strictly. A minor only adds
— an export, an option, a value an option accepts, a field, a span attribute — where code not using
it behaves as before. A break is deprecated in a minor first and lands in the next major with a
`MIGRATION.md` entry; a feature whose right shape breaks waits for that major, never shipping early
in a worse one. Only a major changes:

- each documented option, read back under its own name, and each documented instance field;
- each span attribute and value this README documents, on `log.span` and on the wire;
- that a credential records `REDACTED` in each shape
  [Credentials in a captured value](#credentials-in-a-captured-value) lists, except that a minor may
  add a shape;
- the `format: "json"` output;
- a default;
- a supported runtime;
- what a key of a type you read (`log.conf`, `queue.conf`, `LogInt.conf`, anything handed back)
  can hold: widening it, even where the option behind it accepts more;
- what a type you pass accepts: narrowing it;
- the keys a type you implement is handed or must provide: removing one it is handed, widening
  what one holds, or adding to what it must provide.

**Do not rely on:**

- anything this README does not document, which may change in a minor: an undocumented key of a
  `conf`, enumerability, or what a spread or `JSON.stringify` of a `conf` carries;
- a goal: each is an aim, and the section meeting it says what holds today;
- a `REDACTED` that hides no credential, as on a value percent-encoded more than eight times or
  holding a ninth nested url: a minor may change such a redaction and those limits, so the value may
  show again;
- delivery: the export queue is best-effort, it keeps what `storage` accepted and drops the oldest
  past `maxItems`, keeping a batch it has promised to retry, because telemetry is not payload data;
- the text output line, which is written for people to read — parse `format: "json"` instead.

A major stops being maintained when the next one ships.

## Install

```bash
npm install @larvit/log
```

Node 18 or later. ESM, types included. A React Native app also installs a `URL` polyfill: see
[Runtimes](#audience).

## Log something

```javascript
import { Log } from "@larvit/log";

const log = new Log({ logLevel: "silly" }); // minimum level to output; default "info"
log.error("Apocalypse! :O"); // stderr
log.warn("The chaos is near"); // stderr
log.info("All is well, but important"); // stdout
log.verbose("Good in a production environment"); // stdout
log.debug("Detailed debugging logs"); // stdout
log.silly("Open the flood gates!"); // stdout
```

Levels, most to least severe: `error`, `warn`, `info`, `verbose`, `debug`, `silly`. `"none"` outputs
nothing but this library's own lines, which no `logLevel` silences: its `@larvit/log:` warnings and,
with an OTLP transport, the export queue's failure reports. To drop them too, pass a no-op `stderr`,
and a no-op `report` to `otlpTransport` or to a `Queue` you build.

Keep the message a static string and put every value in the metadata object, so entries with the
same message aggregate in your log backend:

```javascript
log.info("Order placed", { orderId, total: 199, express: true });
// 2022-09-24T23:40:39.123Z [inf] Order placed {"orderId":"…","total":199,"express":true}
```

Metadata values are `string`, `number` or `boolean`. A key whose value is `undefined` is dropped, so
optional fields pass straight through. Keys set in the instance's `context` option are added to every
entry and win over a per-call key of the same name.

## Group logs into a trace

Every `Log` instance is a span. Give it a parent and its span nests under the parent's, joining the
same trace; give it an [`otlpTransport`](#transports) and its entries and span are exported there. A span (a timed
unit of work) and its trace (the tree of spans one request produces) are what a tracing backend such
as Grafana Tempo or Jaeger shows.

```javascript
import { consoleTransport, Log, otlpTransport } from "@larvit/log";

const appLog = new Log({
	context: { "service.name": "foobar" },
	transports: [consoleTransport(), otlpTransport({ baseUrl: "http://127.0.0.1:4318" })],
});

async function myRequestHandler(req, res) {
	const reqLog = new Log({
		context: { ...appLog.context, requestId: crypto.randomUUID() },
		parentLog: appLog,
		spanName: "request",
	});

	reqLog.info("Incoming request", { url: req.url });

	try {
		// ... request handler logic ...
	} catch (err) {
		await reqLog.end({ error: err });
		throw err;
	}

	await reqLog.end();
}
```

A child inherits every option it does not set itself, `spanName` included; `traceparent` never, and
the OTLP options as [Options](#options) says. Setting `context` on a child replaces the
parent's rather than merging, hence the spread above. The `service.name` context key becomes the
OTLP resource's service name (default `"unnamed-service"`) rather than a per-entry attribute. Every
span and record is exported under the instrumentation scope `@larvit/log`, at this package's
version. A child's log entries attach to the parent's span; the child's own span holds its timing
and is exported by `end()`.

`end()` closes the span, queues it and flushes the [export queue](#queue-exports); a span that is
never ended is never sent. `end({ error })` also marks the span failed: status `ERROR` with the
error's message, and an `error.type` attribute from its string `code`, else `name`, else `"_OTHER"`;
a `null` or `undefined` error is a plain `end()`. Userinfo after `//`, `\\`, `/\` or `\/` in the
message is redacted, and a message that is wholly a url is redacted as [Credentials in a captured
value](#credentials-in-a-captured-value) says; keep other credentials out of error messages. A
logged `log.error()` never fails the span. `await` it to make one delivery attempt before the
process exits (a short-lived script); fire-and-forget is fine in a long-running process. Against a
dead collector `await end()` returns after that attempt, within about 3 s plus however long any
un-awaited `log.fetch()` takes to complete, and returns at once while a retry backoff is pending. An
instance is single-use: logging and `fetch()` on an ended instance throw, `end()` rejects.
`log.flush()` delivers what is queued without ending.

`log.clone(options?)` makes an independent instance with the same settings. `context` merges per
key; `parentLog`, `spanName` and `traceparent` are not copied, so a clone starts a new trace unless
you pass `parentLog` or `traceparent`; any other option you pass wins. Copy settings with `clone()`, never a spread
of `log.conf`, which carries `parentLog` and `traceparent` and whose shape a minor may change
([Audience](#audience)).

## Trace outgoing HTTP

`log.fetch()` is a drop-in for `fetch()` that records a client span under the log's span and sends
a W3C `traceparent` header unless the request already has one, so the downstream service continues
the trace:

```javascript
const res = await reqLog.fetch("https://api.example.com/users", { method: "POST" });

await reqLog.end(); // delivers the span; the fetch itself never waits on the export
```

Responses, errors and the returned promise behave exactly like plain `fetch`: a failed request
rejects, so await it (or attach `.catch`) whenever the call can fail. Without an OTLP transport it
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
an untrusted header is safe to pass.

An unsampled header (flags `00`) is honoured: the instance and its children export no spans, and
`log.traceparent()` and `log.fetch` pass `00` on; `log.sampled` is `false`. Log entries still
export.

## Export what OpenTelemetry instrumentation records

OpenTelemetry's instrumentation packages record a span for each database, queue or RPC call, as
`@opentelemetry/instrumentation-pg` does for each query. So does any library that calls
`@opentelemetry/api` itself, as Prisma does. `@larvit/log/otel` exports those spans through a `Log`,
nested under the request they ran in, with no OpenTelemetry SDK:

```bash
npm install @opentelemetry/api @opentelemetry/context-async-hooks
```

```javascript
import { context, trace } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { logTracerProvider, runWithLog } from "@larvit/log/otel";

context.setGlobalContextManager(new AsyncLocalStorageContextManager());
trace.setGlobalTracerProvider(logTracerProvider());

app.use((req, res, next) => {
	const reqLog = appLog.clone({ spanName: `${req.method} ${req.path}`, traceparent: req.headers.traceparent });

	res.on("close", () => reqLog.end());
	runWithLog(reqLog, next);
});
```

Register each instrumentation package as its own docs say. It records through the global tracer
provider, which is now this library's.

`runWithLog(log, callback)` runs `callback` and returns what it returns. A span that a tracer starts
while `callback` runs, or in anything it awaits, joins the trace of `log`. It nests under the span
of `log`, or under the instrumentation span that was active when it started, and goes to the
[transports](#transports) of `log` when it ends. The span carries the context of `log`; where both
hold a key, the span's own attribute wins. `otel.scope.name` and `otel.scope.version` name the
tracer that recorded it. Call `runWithLog` where the request enters your code, as in a middleware:
that call is the only way a span finds its `Log`.

- **A credential in an attribute, the span's name or its status message records `REDACTED`.** Each
  is read by the rules [Credentials in a captured value](#credentials-in-a-captured-value) lists
  for a status message, and an attribute named `http.request.header.<name>` or
  `http.response.header.<name>` by the rule for a header. A value that is an `http:` or `https:`
  url, or a path or query starting with `/` or `?` as in `url.path`, is also read by the rules for
  the request path and query: `?access_token=…` in `url.full` records `?access_token=REDACTED`.
  `url.query` and `url.fragment` are written without their `?` and `#`, and are read as a query and
  a fragment. A value that still holds userinfo once percent-decoded, as in a nested url these
  rules don't parse, records `REDACTED` whole. A literal in a `db.query.text`, such as a password in
  an `UPDATE`, is none of these shapes and reaches your collector: pass it as a query parameter, so
  the query text holds only its placeholder. The context of `log` is exported as written.
- **A span started outside `runWithLog` is not exported,** and neither is one under a `Log` whose
  trace is unsampled.
- **OpenTelemetry's context manager does the nesting,** so install one before the first request.
  Without one, `runWithLog` still runs `callback`, no span is exported, and the `stderr` of `log`
  gets one warning. This library keeps no context of its own.
- **Span events, span links and attributes holding a list are left out,** and counted in the span's
  `droppedEventsCount`, `droppedLinksCount` and `droppedAttributesCount`. An exception recorded on a
  span is an event, so set the span's status to keep its message. Every other attribute value is
  exported as a string, as every attribute this library sends is.
- **An instrumentation package sends `traceparent` downstream only through a propagator,** as
  OpenTelemetry's HTTP client instrumentation does. Set one with `propagation.setGlobalPropagator()`,
  such as `W3CTraceContextPropagator` from `@opentelemetry/core`. `log.fetch` needs none.
- **`@opentelemetry/api` 1.3.0 or later, below 2,** is an optional peer dependency. An app that
  never imports `@larvit/log/otel` doesn't install anything more and loads only `index.js`.

CI proves the adapter on Node 18 to 26. The adapter doesn't read anything Node-specific, so it
runs wherever OpenTelemetry's context manager for that runtime does.

## Transports

A transport is a destination a `Log` hands entries and spans to. `transports` lists every one:

```javascript
import { consoleTransport, Log, otlpTransport } from "@larvit/log";

const log = new Log({
	transports: [
		consoleTransport({ format: "json" }),
		otlpTransport({ baseUrl: "https://collector.example.com", headers: { Authorization: "Bearer …" } }),
	],
});
```

The list is the whole set: with `transports: [otlpTransport({ … })]` nothing is written to the
console, and with `transports: []` nothing goes anywhere. Unset, a `Log` writes text to the console.
A child and a clone use their source's list, and a list of their own replaces it. To add to a
parent's list, spread it: `transports: [...parentLog.conf.transports, mine]`. A `Log` given no list
has no `conf.transports` to spread: what its [deprecated options](#deprecated-options) write is not
a list, and a child that passes a list of its own takes none of it.

`consoleTransport(options)` writes `error` and `warn` to `stderr` and the other levels to `stdout`:

| Option | Type | Default | |
|---|---|---|---|
| `colors` | `boolean` | `true` | ANSI colour codes in text output. Unset in code, the env decides: `NO_COLOR` (non-empty) turns it off; otherwise `FORCE_COLOR` turns it on, except `0` or `false` which turn it off. |
| `format` | `"json" \| "text" \| EntryFormatter` | `"text"` | See [Output formats](#output-formats). |
| `printTraceInfo` | `boolean` | `false` | Append `spanId`, `traceId` and `spanName` to each line: those of the span the entry is exported under, which for a child is its parent's. |
| `stderr` | `(msg: string) => void` | `console.error` | Sink for `error` and `warn`. |
| `stdout` | `(msg: string) => void` | `console.log` | Sink for the other levels. |

`otlpTransport(options)` exports over OTLP/HTTP through an [export queue](#queue-exports) of its
own, and takes every option of that queue. Three have shorter names here, and `fetch` is the one
most apps on React Native set:

| Option | Type | Default | |
|---|---|---|---|
| `baseUrl` | `string` | required | The queue's `otlpHttpBaseURI`: entries are POSTed to `/v1/logs` under it and spans to `/v1/traces`. |
| `fetch` | `typeof fetch` | the global `fetch` | What the queue sends with, such as `expo/fetch` or one that pins TLS. |
| `headers` | `Record<string, string>` | none | The queue's `otlpAdditionalHeaders`. |
| `protocol` | `"http/json" \| "http/protobuf"` | `"http/json"` | The queue's `otlpProtocol`. |

Create one `otlpTransport` per collector, and pass that one to every `Log` that exports there, since
each has a queue of its own. Its queue's failure reports and warnings go to its `report` option,
`console.error` unless you pass one, and name the options as you wrote them here.

### Write your own

A transport is an object with any of three methods:

```javascript
const sentry = {
	entry({ logLevel, msg, metadata, msTimestamp, traceId, spanId, spanName }) {
		if (logLevel === "error") Sentry.captureMessage(msg, { extra: metadata });
	},
	flush() { return Sentry.flush(); },
};

const log = new Log({ transports: [consoleTransport(), sentry] });
```

| Method | |
|---|---|
| `entry(entry)` | Called for each entry at or above `logLevel`. `metadata` holds the call's metadata and the instance's context, which wins where both have a key. `traceId`, `spanId` and `spanName` name the span the entry is exported under, which for a child is its parent's. Every transport is handed the same object, so copy it before changing it. |
| `span({ span, attributes })` | Called for each ended span of a sampled trace. `span` is the `OtlpSpan`. `attributes` holds what it is exported with: the context of the `Log` that ended it, `error.type`, and a `log.fetch` span's HTTP attributes. |
| `flush()` | Awaited by `log.flush()` and `log.end()`. Return a promise that settles once everything handed over is delivered. If it rejects, so do they, once every other transport has flushed, so an `end()` you don't await needs a `flush()` that never rejects. |

Leave out the methods for what you don't handle. A later minor may add a method for a new kind of
record. Each record goes to the transports in the order of the list. What a method throws is thrown
from the call that logged, and the transports after it are not reached.

### Deprecated options

`transports` replaces nine options on `Log`, removed in 3.0.0:

- `colors`, `entryFormatter`, `format`, `printTraceInfo` and `stdout` go to `consoleTransport`.
- `otlpAdditionalHeaders`, `otlpHttpBaseURI` and `otlpProtocol` go to `otlpTransport`, as `headers`,
  `baseUrl` and `protocol`. So does what an `otlpQueue` was built with; an `otlpQueue` of your own
  becomes a transport of your own.

Until then they work as before on a `Log` with no list and write no warning. Beside a list, the
`Log`'s own or an inherited one, each throws and names where it goes.

`stderr` stays on `Log`, where this library's own `@larvit/log:` warnings are written whatever the
list holds. Without a list it is also where `error` and `warn` go, so when you move to a list pass
your `stderr` to `consoleTransport` too. An `otlpTransport`'s export reports go to its `report`, not
to the `Log`'s `stderr`.

## Queue exports

Every entry and span an `otlpTransport` takes goes through an export queue, shared by every child
and clone that uses the list, so one process sends few POSTs and retries a batch the collector did
not accept with backoff. Configure it to persist the queue or to tune it:

```javascript
import "react-native-url-polyfill/auto"; // React Native only, see Runtimes
import { consoleTransport, Log, otlpTransport } from "@larvit/log";
import AsyncStorage from "@react-native-async-storage/async-storage";

const appLog = new Log({
	context: { "service.name": "mobile-app" },
	transports: [consoleTransport(), otlpTransport({ baseUrl: "https://collector.example.com", storage: AsyncStorage })],
});
```

With `storage`, undelivered items are written after every change and loaded, ahead of new ones, by
the next queue created with the same `storage` and `key`. `AsyncStorage` and `localStorage` fit
`storage` as they are; anything with `getItem`, `setItem` and `removeItem`, sync or async, does.
Create one queue per `key` per process, two would overwrite each other. If `getItem` throws, the
stored queue is left as it is and nothing is written to it until the next start. Without `storage`
the queue is in memory only.

The options below are the queue's own names, which `new Queue(options)` takes;
`otlpTransport` takes the same ones, with `baseUrl`, `headers` and `protocol` for the three `otlp*`
names. A `Log` given the deprecated `otlpQueue` rejects `otlpHttpBaseURI`, `otlpProtocol` and
`otlpAdditionalHeaders` beside it.

Credentials go either in the endpoint as `user:pass@`, which is sent as an `Authorization: Basic`
header, or in `otlpAdditionalHeaders` as a token of your own. Set one: with both, the
`otlpAdditionalHeaders` one is sent, one `@larvit/log:` line is written, and 3.0.0 throws. Over
plain `http:` either one is readable by anything on the network path, so use `https:` unless the
collector is local or on a network you trust. A credential header is one whose name
[Credentials in a captured value](#credentials-in-a-captured-value) lists, such as `Authorization`
or `api-key`. Each one sent over `http:` to a host other than `localhost`, `127.0.0.0/8` or `::1`
writes one `@larvit/log:` line naming the host and the header, and still sends. A line is written
once per host, header and credential source to each `report` function, or to each `stderr` for a
queue a `Log` built. On a network you trust, pass `acceptPlainHttpCredentials: true`
to `otlpTransport` or to the `Queue`. Its lines go to that queue's `report`, `console.error` unless
you pass one. A `Log` using the deprecated `otlpHttpBaseURI` moves its `otlp*` options to
`otlpTransport({ acceptPlainHttpCredentials: true, baseUrl })`.

| Option | Type | Default | |
|---|---|---|---|
| `acceptPlainHttpCredentials` | `boolean` | `false` | Silences the line a credential header over plain `http:` writes, for a collector on a network you trust. |
| `batchDelayMs` | `number` | `1000` | How long a queued item waits for company before a send. |
| `clock` | `Clock` | system clock | `{ now, setTimeout, clearTimeout }` behind the batch, retry and send-timeout timers. Supply one to control time: a deterministic test, or a corrected `now()`. |
| `fetch` | `typeof fetch` | the global `fetch` | What the queue sends with. Unset, the global `fetch` is read at each send. |
| `key` | `string` | `"@larvit/log:otlp-queue"` | The `storage` key. |
| `maxBatchBytes` | `number` | `65536` | Items per POST are cut here, measured as their JSON size. The default is the browser `keepalive` limit; a batch over 64 KiB is sent without `keepalive`. |
| `maxItems` | `number` | `1000` | Queue bound. The oldest items are dropped when exceeded, reported in one stderr line with the count. |
| `otlpAdditionalHeaders` | `Record<string, string>` | none | Extra headers on every request, e.g. `{ Authorization: "Bearer …" }`, read afresh each send so a rotated token takes effect. The queue sets `Content-Type`, and `Authorization` when the endpoint carries `user:pass@`; a name here replaces it, matched case-insensitively. A name or value the runtime rejects drops that batch with one report line naming the header, or its position, counting from 1, where the name isn't a valid header name, since that may be a whole pasted header line. `queue.conf` and `log.conf` keep the headers as you gave them, so don't log either. |
| `otlpHttpBaseURI` | `string` | required | OTLP/HTTP endpoint, e.g. `http://127.0.0.1:4318`. Logs go to `/v1/logs`, spans to `/v1/traces` under it; a base path is kept. `user:pass@` in it becomes an `Authorization: Basic` header, percent-decoded, and never rides in the request url — percent-encode any `/ ? #` in the password, and a literal `%` as `%25`. `queue.conf` and `log.conf` keep the URI as you gave it, so don't log either. A malformed URI, or one that is not `http:`/`https:`, throws in the constructor. |
| `otlpProtocol` | `"http/json" \| "http/protobuf"` | `"http/json"` | Wire format. Both use the same endpoint; use protobuf for collectors that reject JSON. |
| `report` | `(msg, metadata) => void` | `console.error` | Sink for one line per failed attempt, dropped batch, drop round, partially rejected batch or storage failure, and once per host, header and credential source for a credential header over plain `http:`. The `Log`-built queue writes through the instance's `stderr` and formatter, that last line at `warn` and the rest at `error`. |
| `retryDelayMs` | `number` | `1000` | Delay before the first retry; doubles per consecutive failure, capped at 30 s. |
| `storage` | `QueueStorage` | none | Persists the queue, see above. |

A send has a 3 s timeout. Any 2xx is success; a JSON response whose `partialSuccess` has a rejected
count is reported with the count and the collector's message, and the batch is not resent. A network
error, timeout, 408, 429 or 5xx keeps the batch for retry; any other non-2xx drops it, a 401 or 403
reported as `OTLP export unauthorized, batch dropped`. In a
short-lived script, `await end()` before exit: it sends what is queued at once. A pending batch or
retry never keeps a Node, Bun or Deno process alive, so a script that awaits neither `end()` nor
`flush()` exits without exporting what it queued, and one whose first attempt fails loses the batch
at exit, `await end()` or not; give the queue a `storage` to carry it into the next run.

In a browser, the collector must answer a CORS preflight, unless it is on the page's own origin.
Every cross-origin POST sets `Content-Type` to a value CORS doesn't safelist, so the browser first
sends an `OPTIONS` request. The collector's answer must allow `Content-Type` and every other header
the queue sends: `Authorization` when the endpoint carries `user:pass@`, and each header in
`otlpAdditionalHeaders`. Without that, every batch fails as a network error, such as Chrome's
`Failed to fetch`, and is retried, never dropped, while newer items queue behind it and the oldest
of those are dropped past `maxItems`. In the OpenTelemetry Collector, set the OTLP/HTTP receiver's
`cors`: your page's origin in `allowed_origins`, and each header you send in `allowed_headers`.

`flush()` on `Log` or `Queue` sends everything queued, one attempt per batch, and resolves when that
round is done. A failed batch stays queued for the retry, and until that fires `flush()` attempts
nothing new, so `end()` on a busy server cannot hammer a failing collector. Records under one
resource share one `resourceLogs` entry per POST. Any object with `enqueue(payload)` and `flush()`
can stand in for `Queue`: the `OtlpQueue` type, with `OtlpLogPayload` and `OtlpSpanPayload` for
what arrives.

## Accept a logger in your library

Take a `Logger` and default to a silent instance, so the consumer decides whether and where your
library logs. `enabled(level)` tells you whether a call at that level would output, so expensive
metadata is built only when it will be seen:

```typescript
import { Log, type Logger } from "@larvit/log";

export function createClient(options: { log?: Logger, settings: Settings }) {
	const log = options.log ?? new Log({ logLevel: "none" });
	log.debug("createClient() - connecting", { host: options.settings.host });
	if (log.enabled("silly")) {
		log.silly("createClient() - full settings", { settings: JSON.stringify(options.settings) });
	}
}
```

A consumer passes `new Log({ logLevel: "debug" })`, or a child of their request log so your
library's entries land in their trace.

For a span per operation, take a `LogInt` instead, make a child,
`new Log({ parentLog: log, spanName: "submit_sm" })`, log on it and `end()` it: the child is a
`Logger`, where the `LogInt` you were handed is not until 3.0.0. It inherits the
consumer's level, sinks and OTLP settings, so a `"none"` consumer gets no line of yours. Never `end()` the
instance you were handed; it is single-use and the consumer owns it.

## Options

`new Log(options)` or `new Log()`, `options` a `LogOptions`. Every option is optional. A level string in place of the object,
`new Log("debug")` or `log.clone("debug")`, is deprecated: it still sets the level, warns once per
`stderr` sink for each distinct warning text and is removed in 3.0.0, so pass `{ logLevel }`
instead. `entryFormatter` is deprecated the same way: pass the function as `format` of a `consoleTransport` in `transports`.

| Option | Type | Default | |
|---|---|---|---|
| `captureQuery` | `boolean` | `false` | `log.fetch` only: keep the query string in `url.full`. Not every secret in it is redacted — see [Credentials in a captured value](#credentials-in-a-captured-value). |
| `captureRequestHeaders` | `string[]` | none | `log.fetch` only: request header names to record as `http.request.header.*`. Not every secret in one is redacted — see [Credentials in a captured value](#credentials-in-a-captured-value). An invalid name is skipped, with one `stderr` warning. |
| `captureResponseHeaders` | `string[]` | none | `log.fetch` only: response header names to record as `http.response.header.*`. Same redaction and invalid-name handling as `captureRequestHeaders`. |
| `clock` | `Clock` | system clock | `{ now, setTimeout, clearTimeout }` behind every span and entry timestamp. Passed on to the default `Queue`; a `Queue` you build takes its own. |
| `colors` | `boolean` | `true` | Deprecated, removed in 3.0.0: pass [`transports`](#transports) with `consoleTransport({ colors })`. ANSI colour codes in text output. Unset in code, the env decides: `NO_COLOR` (non-empty) turns it off; otherwise `FORCE_COLOR` turns it on, except `0` or `false` which turn it off. |
| `context` | `MetadataInput` | `{}` | Added to every entry. Wins over a per-call key of the same name. An `undefined` key is dropped, so `log.conf.context` reads back as `Metadata`. |
| `entryFormatter` | `EntryFormatter` | none | Deprecated, removed in 3.0.0: pass [`transports`](#transports) with `consoleTransport({ format })`. Wins over a `"text"`/`"json"` `format`; two different formatters, one per spelling, throw. On `log.conf` it reads the formatter in use, and writing it swaps it. |
| `format` | `"json" \| "text" \| EntryFormatter` | `"text"` | Deprecated, removed in 3.0.0: pass [`transports`](#transports) with `consoleTransport({ format })`. Console output format, or a formatter of your own. Any other string writes text and warns once per `stderr` sink. Use the entry's `msTimestamp` rather than `new Date()` so console and OTLP timestamps of one entry match. `log.conf.format` never holds a function before 3.0.0; `resolveFormatter(log.conf)` reads the formatter in use, as `log.conf.entryFormatter` does until 3.0.0. Writing `"text"` or `"json"` to `log.conf.format` takes effect from the next line, unless a function formatter is set, which wins. |
| `logLevel` | `LogLevel \| "none"` | `"info"` | Minimum level to output. Any other value is kept as written, logs at `"info"` and warns once per `stderr` sink and value. |
| `otlpAdditionalHeaders` | `Record<string, string>` | none | Deprecated, removed in 3.0.0: pass [`transports`](#transports) with `otlpTransport({ headers })`. Shorthand: the same option on the default `Queue`, see [Queue exports](#queue-exports). Not inherited by a child or clone whose `otlpHttpBaseURI` has another origin (scheme, host and port) than its source's. |
| `otlpHttpBaseURI` | `string` | none | Deprecated, removed in 3.0.0: pass [`transports`](#transports) with `otlpTransport({ baseUrl })`. Shorthand for `otlpQueue: new Queue({ otlpHttpBaseURI, otlpProtocol, otlpAdditionalHeaders })`. `user:pass@` in it authenticates, see [Queue exports](#queue-exports). |
| `otlpProtocol` | `"http/json" \| "http/protobuf"` | `"http/json"` | Deprecated, removed in 3.0.0: pass [`transports`](#transports) with `otlpTransport({ protocol })`. Shorthand: the same option on the default `Queue`. |
| `otlpQueue` | `OtlpQueue` | none | Deprecated, removed in 3.0.0: pass [`transports`](#transports) with `otlpTransport({ baseUrl })` or a transport of your own. The [export queue](#queue-exports). Cannot be combined with the three shorthands above; on an instance given them, `log.conf.otlpQueue` reads back the queue they built. Inherited by children and clones; one that sets a shorthand instead gets a queue of its own. |
| `parentLog` | `LogInt` | none | Nest under this instance's span and inherit its options except `traceparent`. Log entries attach to the parent's span. |
| `printTraceInfo` | `boolean` | `false` | Deprecated, removed in 3.0.0: pass [`transports`](#transports) with `consoleTransport({ printTraceInfo })`. Append `spanId`, `traceId` and `spanName` to console output. |
| `randomBytes` | `(size: number) => Uint8Array` | Web Crypto, else `Math.random` | Returns `size` random bytes for each trace and span id the `Log` makes. Supply one for deterministic ids in a test. Return exactly `size` bytes, and never all zeros: W3C Trace Context makes an all-zero id invalid, so a receiver drops it. Children and clones inherit it. |
| `spanName` | `string` | `"unnamed-span"` | The instance's span name. Inherited from `parentLog` when set there. |
| `stderr` | `(msg: string) => void` | `console.error` | Sink for this library's own warnings. Without `transports`, also for `error` and `warn`. |
| `stdout` | `(msg: string) => void` | `console.log` | Deprecated, removed in 3.0.0: pass [`transports`](#transports) with `consoleTransport({ stdout })`. Sink for the other levels. |
| `traceparent` | `string` | none | Incoming W3C `traceparent` to nest under; an unsampled one (`00`) drops spans, not log entries. Ignored when malformed or when `parentLog` is set. |
| `transports` | `Transport[]` | the console | Every destination entries and spans go to, see [Transports](#transports). Inherited by children and clones. |

## Output formats

Text (default). The level is a three-letter tag, `err`/`war`/`inf`/`ver`/`deb`/`sil`, wrapped in
ANSI colour codes when `colors` is on; parse `format: "json"` instead of this:

```
2022-09-24T23:40:39.123Z [inf] Order placed {"orderId":"…","total":199}
```

JSON (`format: "json"`), one object per line. `logLevel`, `msg` and `time` win over metadata keys of
the same name:

```json
{"orderId":"…","total":199,"logLevel":"info","msg":"Order placed","time":"2022-09-24T23:40:39.123Z"}
```

A formatter of your own takes the entry and returns the line. Children and clones inherit it with
the list:

```javascript
new Log({ transports: [consoleTransport({ format: entry => `${entry.logLevel} ${entry.msg}` })] });
```

OTLP receives every metadata value as a string (`{ total: 199 }` → `"199"`); the JSON formatter
keeps it native. Levels map to OTLP severity through the exported `LogLevels` table.

## `log.fetch` in depth

**`log.fetch` mirrors the runtime's `fetch`** ([Goals #1 and #3.1](#goals)). It takes a `string` or
`URL` and an `init`. On an instance not yet ended, given an `init`, the response, the
rejection and the promise you see are exactly what the runtime produced. What it adds is outbound trace context and a span,
and never a success the platform would have refused. The request differs from yours only by
`traceparent`, which is not CORS-safelisted, so a cross-origin call is preflighted and needs the
server to list it in `Access-Control-Allow-Headers`.

Only a URL that resolves to `http:` or `https:` is traced — a relative one resolves against the
page, so it is untraced where there is no page, as on a server, and where the page is not
`http:`/`https:`, as under a `file:` or app-scheme origin. Anything else passes straight through to
an untraced `fetch`: no span, and no `traceparent` sent.

Span attributes follow the OpenTelemetry HTTP semantic conventions:

| Attribute | Value |
|---|---|
| `http.request.method` | Request method, `GET` when unset |
| `url.full` | The URL without the outer userinfo. Path and query redacted as [Credentials in a captured value](#credentials-in-a-captured-value) says; query string dropped unless `captureQuery` |
| `url.scheme`, `server.address`, `server.port` | From the URL; port only when explicit |
| `http.request.header.<name>` | Headers listed in `captureRequestHeaders` |
| `http.response.status_code` | Response status |
| `http.response.header.<name>` | Headers listed in `captureResponseHeaders` |
| `error.type` | On a thrown error: its `code`, a numeric one as digits (an abort records `"20"`), else `name`, else `"fetch_error"` |

A 4xx/5xx response marks the span errored; a thrown error does too, its message the status
message, redacted as [Credentials in a captured value](#credentials-in-a-captured-value) says.
Bodies are never captured.
`captureQuery` and the header allow-lists are read at call time from the instance; `clone()` to vary
them per call site.

### Credentials in a captured value

Only what the bullets below name is redacted. They apply to `log.fetch`'s spans, and to the spans
`@larvit/log/otel` exports as
[its section](#export-what-opentelemetry-instrumentation-records) says. Anything else is exported
as written, text you log
yourself included, and so is a url you base64-encode into a request path, as an image proxy such as
imgproxy takes one.

- **A header, whatever you list it for,** whose name, in any casing, is `cookie`, `passwd`,
  `password`, `pwd`, `secret` or `set-cookie`, ends in `key`, or holds `auth`, `card`, `credit`,
  `principal`, `session` or `token` — Elastic APM's default `sanitize_field_names`. It covers
  `authorization`, `x-api-key` and `x-amz-security-token`. The header is kept, its value records
  `REDACTED`. A name the rule misses exports as written, `x-client-secret` and `x-db-password` among
  them, so leave such a header off `captureRequestHeaders` and `captureResponseHeaders`.
- **The value of a query key among what `captureQuery` keeps** that, in any casing and with `-` and
  `_` ignored, ends in `auth`, `authentication`, `authorization`, `consumerid`, `credential`, `key`,
  `keyid`, `pass`, `passphrase`, `secret`, `sig`, `sign`, `signature`, `signed` or `token`, or in
  `passwd`, `password`, `pwd` or `pword` with an optional `1` or `2`, or is `code`,
  `googleaccessid` or `idtokenhint`. It covers `access_token`, `api_key`, `client_secret`, Azure's
  `?code=` and `subscription-key`, and presigned S3, GCS and Azure SAS urls. The key itself is kept.
- **A url in a kept query value**, once decoded, that the runtime's `URL` parses: its userinfo makes
  the value record `REDACTED`, and its own matched keys are redacted, at every level:
  `?next=https://t.test/x?token=…` records `next=https%3A%2F%2Ft.test%2Fx%3Ftoken%3DREDACTED`. A url
  in a key is read alone and with its value, and where either finds a credential both record
  `REDACTED`: `?https://t.test/x?token=…`, `?https://a@b=pw@host` and `?https://u:p=w@host` record
  `REDACTED=REDACTED`. A url nested deeper than eight levels records `REDACTED` whole.
- **A captured header value or a status message that the runtime's `URL` parses whole:** userinfo or
  a matched key, at every level as above, makes a header value record `REDACTED` whole, and a status
  message record `REDACTED` in place: `http://REDACTED@host/x?access_token=REDACTED`. In its own
  span's status, `log.fetch` also redacts the url it fetched wherever the runtime's rejection quotes
  it, its query and a url nested in its path included.
- **Userinfo after `//`, `\\`, `/\` or `\/` in a captured header value, a kept query key or value, a
  status message or the request path:** an `@` after `//` with no `/`, `?`, `#` or space between,
  or after `\\`, `/\` or `\/` with none of those and no `\` between. Any other whitespace character,
  a tab or a no-break space included, stays inside the userinfo. This covers a url
  among other text, and one the runtime cannot parse, such as `//user:pass@host`. A header value or
  query value records `REDACTED` whole. A query key holding such userinfo, or one where the userinfo
  runs across the `=` or an `&`, as in `?//u:p=w@host` and `?//u:p&w@host`, records `REDACTED`
  together with its value. So does each pair after the key, up to the one holding the last `@`
  before the next `/`, `?`, `#` or space, or before the query ends. A kept query is read both ways, raw and
  form-decoded, and userinfo either reading finds records `REDACTED`. Raw, a `+`, `%20`, `%2F`, `%3F`
  and `%23` stay inside userinfo, as in `?next=//my+user:pw@cb.test/x` and `?//u:p&a%2Fb&w@host`;
  form-decoded, they read as a space, `/`, `?` and `#`. So `?text=Visit+https://app.test+or+mail+help@app.test`
  records `REDACTED`. A status
  message records `REDACTED` in place: `retry https://REDACTED@h/x`. A header value, query part or
  path is also read percent-decoded, up to eight times; one encoded deeper records `REDACTED`.
- **A matched query key and its `=`, after a `?`, `&`, `#` or `;` in a header value, a kept query key or
  value, or a status message,** where the rules above didn't reach it: `location: /cb?token=…`,
  `link: </next?access_token=…>`, node-fetch's `request to …?token=… failed`,
  `?src=%2F%2Fcdn.test%2Fk%3Fsig%3D…`, and an OAuth implicit-flow redirect's
  `location: https://app.test/cb#access_token=…`. A header value or query value records `REDACTED`
  whole, and a query key records it together with its value. A status message records `REDACTED` in
  place of the value: `request to https://h/x?token=REDACTED failed`. The value may hold a `?` and
  ends at `&`, `#` or a plain space; any other whitespace stays in it. Text is
  read percent-decoded up to eight times as above; a status message holding such a key only decoded,
  or encoded deeper, records `REDACTED` whole. Keep credentials out of error messages, or replace a
  message before `end({ error })`.
- **A url nested in the request path**, raw or percent-encoded, as a fetch-through or image proxy
  takes one. The path records `REDACTED` from the first segment that starts with a scheme, such as
  `https:`, and opens a url holding a credential by these rules: `/fetch/REDACTED`. It also records
  `REDACTED` from the first segment where a matched query key follows a `?`, `&`, `#` or `;`, raw or
  percent-encoded, wherever the nested url sits: `/fetch/s3.test/k%3Fsig%3D…` records
  `/fetch/s3.test/REDACTED`, `/a/x=https:%2F%2Fcb.test%2Fx%3Fpassword%3D…` records
  `/a/REDACTED`, and a matrix parameter in the path itself, as in `/m/img;sig=…/x.png`, records
  `/m/REDACTED`. It also records `REDACTED` from the ninth segment starting with a scheme, whatever
  that segment holds. Where userinfo, as the bullet above reads it, remains in what the path keeps,
  or the path is percent-encoded more than eight times, the whole path records `/REDACTED`.

Never put credentials in the url; pass an `Authorization` header, and strip userinfo from a url you
did not build. `log.fetch` mirrors the runtime: Node and browsers refuse such a url, while React
Native hands it to the platform, where iOS sends the credentials and Android sends none, leaving
you the 401.

`REDACTED` does not always stand for a credential: a `?key=` lookup, a `?token=` pagination cursor,
a `?code=` promo code, an `?oauth=` or `?design=` flag, and the headers `www-authenticate`,
`x-idempotency-key` and `x-session-id` record it, and so does an address read as userinfo, as in
`https://api.test,mail@example.com`. In a path, `REDACTED` replaces everything from the cut on:
`/fetch/s3.test/k%3Fkey%3D1`, a `?key=` lookup, records `/fetch/s3.test/REDACTED`, and
`/users//bob@x.test` records `/REDACTED`.

Spans are queued when the response arrives and are registered with `flush()` at call time, so
`await log.end()` delivers a `log.fetch()` you never awaited.

## Footprint

Budgets for [Goals #5](#goals), measured on this repo's container image: ≤10 KB gzipped, ≤50 ns for
a call below `logLevel`, ≤2 µs for a console call, ≤10 µs with OTLP configured, ≤1 KB per instance,
≤1.5 KB per queued record, ≤1.5 MiB for a full 1000-item queue.

## Exports

| Export | |
|---|---|
| `Log` | The logger class. |
| `consoleTransport(options?)`, `otlpTransport(options)` | The two transports this library ships, see [Transports](#transports). |
| `Transport`, `TransportEntry`, `TransportSpan` | A transport, `{ entry?, span?, flush? }`, and what `entry` and `span` are handed. |
| `ConsoleTransportOptions`, `OtlpTransportOptions` | What the two shipped transports take. |
| `Queue` | The export queue that `otlpTransport` builds and the deprecated `otlpQueue` takes, `new Queue(options)`, see [Queue exports](#queue-exports). |
| `LogLevels` | Level → OTLP `severityNumber`/`severityText`, most to least severe. |
| `msgTextFormatter`, `msgJsonFormatter` | The built-in formatters; wrap one to extend it. |
| `resolveFormatter(conf)` | The `EntryFormatter` a `LogConf` writes with, e.g. a `LogInt.conf` you were handed. |
| `parseTraceparent(header)` | `{ traceId, spanId, flags, sampled }` or `null` when malformed or version `ff`. |
| `formatTraceparent(traceId, spanId, sampled?)` | Builds a W3C `traceparent` header value. |
| `generateTraceId()`, `generateSpanId()` | Random 32- and 16-hex-char ids. |
| `Logger` | The six level methods, taking `MetadataInput`, and `enabled(level)`. Accept this in library code. |
| `LogInt` | Six `LogShorthand` level methods plus `fetch`, `traceparent`, `end({ error }?)`, `conf`, `span`, and optional `enabled`, `flush`, `sampled`; 3.0.0 makes it `Logger` plus the rest, those three required. What `parentLog` takes. |
| `LogOptions`, `LogConf`, `ResolvedLogConf` | What `new Log()` and `clone()` take; `LogInt.conf`; `log.conf`, defaults applied. |
| `LogLevel`, `LogShorthand` | Level name union; the signature of one `LogInt` level method. |
| `Metadata`, `MetadataValue` | `Record<string, string \| number \| boolean>` and its value type: what a formatter and `log.context` see. |
| `MetadataInput` | `Metadata` whose values may be `undefined`: what `Logger`'s level methods and `LogOptions.context` accept. |
| `EntryFormatter`, `LogEntry`, `EntryFormatterConf` | A formatter, `(entry) => string`, and the entry it takes: `{ colors? (unset = on), logLevel, metadata?, msg, msTimestamp? }`. `EntryFormatterConf` is deprecated, the same type as `LogEntry`, and 3.0.0 removes it. |
| `OtlpSpan`, `OtlpAttribute`, `OtlpLogPayload`, `OtlpSpanPayload`, `OtlpScope` | The OTLP wire shapes; `log.span` is an `OtlpSpan`. |
| `OtlpQueue`, `OtlpPayload` | What `otlpQueue` takes, `{ enqueue, flush }`, and what `enqueue` receives, a log or span payload. |
| `Clock`, `TimerHandle` | The `clock` option, `{ now, setTimeout, clearTimeout }` with `now()` in epoch milliseconds, and what its `setTimeout` hands back. |
| `QueueConf`, `ResolvedQueueConf`, `QueueStorage` | `Queue`'s options, `queue.conf` with defaults applied, and the `storage` shape, `{ getItem, setItem, removeItem }`. |

Instance fields: `log.conf`, `log.context`, `log.span`, `log.sampled`, `log.ended`.

`@larvit/log/otel` exports `logTracerProvider()`, which returns an OpenTelemetry
`TracerProvider`, and `runWithLog(log, callback)`; see
[Export what OpenTelemetry instrumentation records](#export-what-opentelemetry-instrumentation-records).

## Development

Everything runs in Docker with dependencies installed in the container, so no local `npm install`.
The exceptions: `npm run lint` needs Node 20+ and `npm ci` on the host, and `npm run test-otlp`
needs Node 18+ on the host.

| Command | |
|---|---|
| `npm test` | Node and browser suites. |
| `npm run test-docker` | Node suite, on the image the `Dockerfile` pins. `NODE_IMAGE=node:18.20.8-bookworm-slim npm run test-docker` picks another; CI runs 18 to 26. |
| `npm run test-browser` | The same suite in Chromium, less the OpenTelemetry adapter's tests. |
| `npm run test-otlp` | Export to a real OpenTelemetry Collector, JSON and protobuf. `OTLP_DEBUG=1` prints what it received. |
| `npm run test-mutation` | Stryker mutation tests of the library, against the Node suite. `npm run test-mutation -- --mutate credentials/path.ts:30-50` mutates only those lines. |
| `npm run lint` | eslint. |
| `npm run lint-fix` | eslint, fixing what it can, such as import order. |

### Releasing

A published GitHub release runs `.github/workflows/publish.yaml`, which runs `npm publish` on the
build that the release commit's `Push` run already tested. It builds nothing. It fails when that
commit has no passing `Push` run, and a run's build is kept for 90 days, so after that release a
newer commit.
It needs an `NPM_TOKEN` repository secret (an npm automation token with publish rights).

1. Add the version to [CHANGELOG.md](CHANGELOG.md).
2. `npm version <major|minor|patch>`. Breaking changes bump the major.
3. Merge to `main` through a PR.
4. Once the merge's `Push` run on `main` has passed, create a GitHub release with tag `vX.Y.Z` matching
   `package.json`; the workflow fails when they differ.
