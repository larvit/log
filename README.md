# @larvit/log

[![npm](https://img.shields.io/npm/v/@larvit/log)](https://www.npmjs.com/package/@larvit/log)
[![bundle size](https://deno.bundlejs.com/badge?q=@larvit/log)](https://bundlejs.com/?q=%40larvit%2Flog)
[![CI](https://github.com/larvit/log/actions/workflows/push.yaml/badge.svg?branch=main)](https://github.com/larvit/log/actions/workflows/push.yaml)

Structured logging with a tiny API, plus OTLP export of logs and traces from Node, Bun, Deno,
browsers and React Native. No OpenTelemetry SDK, no dependencies.

- **One file, every runtime.** Built on the global `fetch`, so a browser and a React Native app
  export the same way a server does. No SDK, no bundler config, no native module.
- **Exports survive a restart.** Records and spans are batched and retried with backoff; give the
  queue a storage and an offline phone holds them until the network is back.
- **Just log.** `log.info("msg", { key: "value" })` to stdout/stderr, text or JSON.
- **Traces without an SDK.** Set `otlpHttpBaseURI` and every instance is a span, its logs exported
  with it. OTLP (OpenTelemetry's export protocol) over HTTP, JSON or protobuf.
- **HTTP client tracing.** `log.fetch()` is a drop-in `fetch` that records a client span and
  propagates the trace downstream.
- **Composable.** Nest instances under a parent, join an upstream trace from a `traceparent` header,
  hand the current context on to any client.

[Goals](#goals) · [Audience](#audience) · [Install](#install) · [Log something](#log-something) ·
[Group logs into a trace](#group-logs-into-a-trace) ·
[Trace outgoing HTTP](#trace-outgoing-http) · [Join an incoming trace](#join-an-incoming-trace) ·
[Queue exports](#queue-exports) · [Accept a logger in your library](#accept-a-logger-in-your-library) ·
[Options](#options) ·
[Output formats](#output-formats) · [`log.fetch` in depth](#logfetch-in-depth) · [Exports](#exports) ·
[Development](#development) · [Changelog](CHANGELOG.md)

## Goals

Priority order decides a tie.

1. **Runs everywhere.** Node, Bun, Deno, browsers and React Native, on the common JS surface.
   *Runs* identically; behaves identically too wherever that costs no other goal, and where a
   runtime genuinely differs the platform wins and the docs say so.
2. **The telemetry is correct OTLP.** A span or record a backend mis-renders is a broken product.
   Approximating part of the spec is worse than omitting it.
3. **A credential never leaves.** A credential hidden inside something you hand this library to
   *use* — a url it fetches, a header or query value it captures, the OTLP endpoint — never
   reaches a span, a record or `stderr`. Text you write yourself as telemetry is exported as you
   wrote it: the log message, metadata, `context` and `spanName`. So is a header or query value
   you allow-list that simply *is* a secret, because naming it is asking for it and no shape
   tells it from any other string.
4. **A very easy API.** `log.info("msg", { key })` is the whole one-line path. Nobody learns OTLP
   to log.
5. **Composable.** Instances nest, inherit, and attach to an upstream trace.
6. **Low footprint.** Measured on this repo's container image: ≤10 KB gzipped, ≤50 ns for a call
   below `logLevel`, ≤2 µs for a console call, ≤10 µs with OTLP configured, ≤1 KB per instance,
   ≤1.5 KB per queued record, ≤1.5 MiB for a full 1000-item queue.

**`log.fetch` mirrors the runtime's `fetch`.** It accepts what that `fetch` accepts, and the
response, the rejection and the promise you see are exactly what it produced. What it adds is
outbound trace context and a span — never a request the platform would not have made, and never a
success the platform would have refused.

**Metrics travel, they do not accumulate.** Any OTLP metric shape — gauge, delta or cumulative sum,
histogram — may be handed over already aggregated, and this library encodes, batches and delivers
it; the types say what a valid point must carry. Keeping a running total, a stable
`startTimeUnixNano` and bucket boundaries that match across a series is the caller's, so
instruments, temporality conversion and periodic collection stay out. Not implemented yet.

**What earns a place here:** it fits the budget above, it can be implemented to the spec and kept
there, and it stays off the one-line path.

## Audience

Public npm consumers. Three readers, in order:

1. **The app developer** wiring logs and traces into a service or an app.
2. **The library author** accepting a `Logger` from their consumer.
3. **The person reading the telemetry** in Grafana, Tempo or Loki, who never installs the package
   and is who span names and attribute shapes are for.

A mobile app on cellular with offline periods is a primary target, equal to a server: the export
queue survives app restarts through a `storage` adapter, and a full one holds about 1.1 MiB.

**Runtimes.** Anything with global `fetch`, `TextEncoder` and `btoa`. CI proves Node 18 to 26 and
current Chromium. React Native is supported from 0.74, where Hermes gained `TextEncoder` and
`btoa`. Deno and Bun meet the rule and are not in CI.

**Rely on** semver read strictly — a minor only adds, and your code, data and config survive it.
Every breaking change is deprecated in a 2.x minor first and lands in the next major with a
`MIGRATION.md` entry. The `format: "json"` output, the exported types, `log.conf`
and `log.span` are contracts.

**Do not rely on** the text output line, which is written for people to read — parse
`format: "json"` instead. Nor on delivery: the export queue is best-effort, it keeps what `storage`
accepted and drops the oldest past `maxItems`, because telemetry is not payload data. A major stops
being maintained when the next one ships.

## Install

```bash
npm install @larvit/log
```

Node 18 or later. ESM, types included.

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
nothing, except a deprecation warning, which no `logLevel` silences.

Keep the message a static string and put every value in the metadata object, so entries with the
same message aggregate in your log backend:

```javascript
log.info("Order placed", { orderId, total: 199, express: true });
// 2022-09-24T23:40:39Z [inf] Order placed {"orderId":"…","total":199,"express":true}
```

Metadata values are `string`, `number` or `boolean`. A key whose value is `undefined` is dropped, so
optional fields pass straight through. Keys set in the instance's `context` option are added to every
entry and win over a per-call key of the same name.

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

	try {
		// ... request handler logic ...
	} catch (err) {
		await reqLog.end({ error: err });
		throw err;
	}

	await reqLog.end();
}
```

A child inherits every option it does not set itself, `spanName` included. Setting `context` on a
child replaces the parent's rather than merging, hence the spread above. The `service.name` context
key becomes the OTLP resource's service name (default `"unnamed-service"`) rather than a per-entry
attribute. A child's log entries attach to the parent's span; the child's own span holds its
timing and is exported by `end()`.

`end()` closes the span, queues it and flushes the [export queue](#queue-exports); a span that is
never ended is never sent. `end({ error })` also marks the span failed: status `ERROR` with the
error's message, and an `error.type` attribute from its `code`, else `name`; a `null` or `undefined`
error is a plain `end()`. Userinfo in a url the message quotes becomes `REDACTED`; nothing else in
the message is, so keep a token out of an error message. A logged `log.error()` never fails the
span; a recovered error is not a failed operation. `await` it to make one delivery attempt before the
process exits (a short-lived script); fire-and-forget is fine in a long-running process. Against a
dead collector `await end()` returns after that attempt, within about 3 s plus however long any
un-awaited `log.fetch()` takes to complete, and returns at once while a retry backoff is pending;
the retry then runs only for as long as the process lives. An instance is single-use: logging and `fetch()` on an ended instance throw, `end()`
rejects. `log.flush()` delivers what is queued without ending.

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
instance nests under the parent instead. A malformed or version `ff` header is ignored and a fresh
trace starts, so an untrusted header is safe to pass. `traceparent` applies only to the instance it
is given to; children and clones do not inherit it.

An unsampled header (flags `00`) is honoured: the instance and its children export no records or
spans, `log.traceparent()` and `log.fetch` pass `00` on, and console output is unchanged.
`log.sampled` tells which.

## Queue exports

Every record and span goes through an export queue. `otlpHttpBaseURI` builds one, shared by every
child and clone, so one process sends few POSTs and retries a batch the collector
did not accept with backoff. Configure it yourself to persist the queue or to tune it:

```javascript
import { Log, Queue } from "@larvit/log";
import AsyncStorage from "@react-native-async-storage/async-storage";

const appLog = new Log({
	context: { "service.name": "mobile-app" },
	otlpQueue: new Queue({ otlpHttpBaseURI: "https://collector.example.com", storage: AsyncStorage }),
});
```

With `storage`, undelivered items are written after every change and loaded, ahead of new ones, by
the next `Queue` created with the same `storage` and `key`. `AsyncStorage` and `localStorage` fit
`storage` as they are; anything with `getItem`, `setItem` and `removeItem`, sync or async, does.
Create one `Queue` per `key` per process, two would overwrite each other. Without `storage` the
queue is in memory only.

`new Queue(options)`. The endpoint belongs to the queue: a `Log` given `otlpQueue` rejects
`otlpHttpBaseURI`, `otlpProtocol` and `otlpAdditionalHeaders` beside it.

Credentials go either in the endpoint as `user:pass@`, which is sent as an `Authorization: Basic`
header, or in `otlpAdditionalHeaders` as a token of your own, which wins if you set both. Over
plain `http:` either one is readable by anything on the network path, so use `https:` unless the
collector is local or on a network you trust.

| Option | Type | Default | |
|---|---|---|---|
| `batchDelayMs` | `number` | `1000` | How long a queued item waits for company before a send. |
| `clock` | `Clock` | system clock | `{ now, setTimeout, clearTimeout }` behind the batch, retry and send-timeout timers. Supply one to control time: a deterministic test, or a corrected `now()`. |
| `key` | `string` | `"@larvit/log:otlp-queue"` | The `storage` key. |
| `maxBatchBytes` | `number` | `65536` | Items per POST are cut here, measured as their JSON size. The default is the browser `keepalive` limit; a batch over 64 KiB is sent without `keepalive`. |
| `maxItems` | `number` | `1000` | Queue bound. The oldest items are dropped when exceeded, reported in one stderr line with the count. |
| `otlpAdditionalHeaders` | `Record<string, string>` | none | Extra headers on every request, e.g. `{ Authorization: "Bearer …" }`, read afresh each send so a rotated token takes effect. The queue sets `Content-Type`, and `Authorization` when the endpoint carries `user:pass@`; a name here replaces it, matched case-insensitively. A name or value the runtime rejects drops that batch with one report line naming it. |
| `otlpHttpBaseURI` | `string` | required | OTLP/HTTP endpoint, e.g. `http://127.0.0.1:4318`. Logs go to `/v1/logs`, spans to `/v1/traces` under it; a base path is kept. `user:pass@` in it becomes an `Authorization: Basic` header, percent-decoded, and never rides in the request url — percent-encode any `/ ? #` in the password, and a literal `%` as `%25`. `conf` keeps the URI as you gave it, so don't log your `conf`. A malformed URI, or one that is not `http:`/`https:`, throws in the constructor. |
| `otlpProtocol` | `"http/json" \| "http/protobuf"` | `"http/json"` | Wire format. Both use the same endpoint; use protobuf for collectors that reject JSON. |
| `report` | `(msg, metadata) => void` | `console.error` | Sink for one line per failed attempt, dropped batch, drop round, partially rejected batch or storage failure. The `Log`-built queue writes through the instance's `stderr` and formatter. |
| `retryDelayMs` | `number` | `1000` | Delay before the first retry; doubles per consecutive failure, capped at 30 s. |
| `storage` | `QueueStorage` | none | Persists the queue, see above. |

A send has a 3 s timeout. Any 2xx is success; a JSON response whose `partialSuccess` has a rejected
count is reported with the count and the collector's message, and the batch is not resent. A
network error, timeout, 408, 429 or 5xx keeps the batch for retry; any other non-2xx drops it. A
retry timer never keeps a Node or Deno process alive, so a script whose first attempt fails loses
the batch at exit, `await end()` or not; give the queue a `storage` to carry it into the next run.

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
`new Log({ parentLog: log, spanName: "submit_sm" })`, and `end()` that child. It inherits the
consumer's level, sinks and OTLP settings, so a `"none"` consumer stays silent. Never `end()` the
instance you were handed; it is single-use and the consumer owns it.

## Options

`new Log(options)` or `new Log()`. Every option is optional. A level string in place of the object,
`new Log("debug")` or `log.clone("debug")`, is deprecated: it still sets the level, warns once per
`stderr` sink for each distinct warning text and is removed in 3.0.0, so pass `{ logLevel }`
instead. `entryFormatter` is deprecated the same way: pass the function as `format`.

| Option | Type | Default | |
|---|---|---|---|
| `captureQuery` | `boolean` | `false` | `log.fetch` only: keep the query string in `url.full`. Not every secret in it is redacted — see [Credentials in a captured value](#credentials-in-a-captured-value). |
| `captureRequestHeaders` | `string[]` | none | `log.fetch` only: request header names to record as `http.request.header.*`. Not every secret in one is redacted — see [Credentials in a captured value](#credentials-in-a-captured-value). |
| `captureResponseHeaders` | `string[]` | none | `log.fetch` only: response header names to record as `http.response.header.*`. Same redaction as `captureRequestHeaders`. |
| `clock` | `Clock` | system clock | `{ now, setTimeout, clearTimeout }` behind every span and record timestamp. Passed on to the default `Queue`; a `Queue` you build takes its own. |
| `colors` | `boolean` | `true` | ANSI colour codes in text output. Unset in code, the env decides: `NO_COLOR` (non-empty) turns it off; otherwise `FORCE_COLOR` turns it on, except `0` or `false` which turn it off. |
| `context` | `Metadata` | `{}` | Added to every entry. Wins over a per-call key of the same name. |
| `entryFormatter` | `EntryFormatter` | none | Deprecated, removed in 3.0.0: pass the function as `format`. Wins over a `"text"`/`"json"` `format`; two different formatters, one per spelling, throw. On `log.conf` it is a deprecated alias of `format`: reading or writing it warns. |
| `format` | `"text" \| "json" \| EntryFormatter` | `"text"` | Console output format, or a formatter of your own. Use the entry's `msTimestamp` rather than `new Date()` so console and OTLP timestamps of one entry match. Writing `log.conf.format` after construction takes effect from the next line. |
| `logLevel` | `LogLevel \| "none"` | `"info"` | Minimum level to output. |
| `otlpAdditionalHeaders` | `Record<string, string>` | none | Shorthand: the same option on the default `Queue`. |
| `otlpHttpBaseURI` | `string` | none | Shorthand for `otlpQueue: new Queue({ otlpHttpBaseURI, otlpProtocol, otlpAdditionalHeaders })`. `user:pass@` in it authenticates, see [Queue exports](#queue-exports). |
| `otlpProtocol` | `"http/json" \| "http/protobuf"` | `"http/json"` | Shorthand: the same option on the default `Queue`. |
| `otlpQueue` | `OtlpQueue` | none | The [export queue](#queue-exports). Cannot be combined with the three shorthands above. Inherited by children and clones; one that sets a shorthand instead gets a queue of its own. |
| `parentLog` | `LogInt` | none | Nest under this instance's span and inherit its options. Log entries attach to the parent's span. |
| `printTraceInfo` | `boolean` | `false` | Append `spanId`, `traceId` and `spanName` to console output. |
| `spanName` | `string` | `"unnamed-span"` | The instance's span name. Inherited from `parentLog` when set there. |
| `stderr` | `(msg: string) => void` | `console.error` | Sink for `error` and `warn`. |
| `stdout` | `(msg: string) => void` | `console.log` | Sink for the other levels. |
| `traceparent` | `string` | none | Incoming W3C `traceparent` to nest under; its sampled flag is honoured. Ignored when malformed or when `parentLog` is set. |

## Output formats

Text (default). The level is a three-letter tag, `err`/`war`/`inf`/`ver`/`deb`/`sil`, wrapped in
ANSI colour codes when `colors` is on; parse `format: "json"` instead of this:

```
2022-09-24T23:40:39Z [inf] Order placed {"orderId":"…","total":199}
```

JSON (`format: "json"`), one object per line. `logLevel`, `msg` and `time` win over metadata keys of
the same name:

```json
{"orderId":"…","total":199,"logLevel":"info","msg":"Order placed","time":"2022-09-24T23:40:39.123Z"}
```

A formatter of your own takes the entry and returns the line, and is inherited by children and
clones; either can switch back with `format: "text"`:

```javascript
new Log({ format: entry => `${entry.logLevel} ${entry.msg}` });
```

OTLP receives every metadata value as a string (`{ total: 199 }` → `"199"`); the JSON formatter
keeps it native. Levels map to OTLP severity through the exported `LogLevels` table.

## `log.fetch` in depth

Input is a `string` or `URL`; a `Request` is not supported. Only a URL that resolves to `http:` or
`https:` is traced — a relative one resolves against the page, so it is untraced where there is no
page, as on a server, and where the page is not `http:`/`https:`, as under a `file:` or app-scheme
origin. Anything else passes straight through to an untraced `fetch`: no span, and no
`traceparent` sent. The span is the only output; no log line is written.

Span attributes follow the OpenTelemetry HTTP semantic conventions:

| Attribute | Value |
|---|---|
| `http.request.method` | Request method, `GET` when unset |
| `url.full` | The URL without the outer userinfo. Query string dropped unless `captureQuery`, where a credentialed key or value records `REDACTED` |
| `url.scheme`, `server.address`, `server.port` | From the URL; port only when explicit |
| `http.request.header.<name>` | Headers listed in `captureRequestHeaders` |
| `http.response.status_code` | Response status |
| `http.response.header.<name>` | Headers listed in `captureResponseHeaders` |
| `error.type` | On a thrown error: its `code`, else `name`, else `"_OTHER"` |

A 4xx/5xx response marks the span errored; a thrown error does too, with its message as the status
message. The response or error reaches the caller unchanged. Bodies are never captured.
`captureQuery` and the header allow-lists are read at call time from the instance; `clone()` to vary
them per call site.

### Credentials in a captured value

Redacted, whatever you list them for: the headers `authorization`, `proxy-authorization`, `cookie`
and `set-cookie`, and the value of a query key named `awsaccesskeyid`, `sig`, `signature` or
`x-goog-signature`. Redacted wherever it appears: any other captured header value, or kept query
key or value, that holds url userinfo — which records `REDACTED` in place of the whole of itself,
through one layer of percent-encoding but not two.

That covers the shapes a credential is recognisable in, not every credential. It does not reach: a
header or query value that simply *is* a secret — `x-api-key`, your own signed token — which is
exported as you sent it, so do not allow-list one; and a url nested in the request **path**, as a
fetch-through proxy takes, which stays in `url.full` as you wrote it, credentials and all, with no
option involved.

Never put credentials in the url; pass an `Authorization` header, and strip userinfo from a url you
did not build. `log.fetch` mirrors the runtime: Node and browsers refuse such a url, while React
Native's `XMLHttpRequest` polyfill hands it to the platform untouched, where iOS answers the
server's auth challenge with those credentials and Android sends none, leaving you the 401.
`url.full` never holds the outer url's userinfo, and a rejection quoting the url reaches the status message as
`http://REDACTED@host/x` — a redaction of what the runtime wrote, not a guarantee. `REDACTED` does
not always stand for a credential either: an address glued to a host, as in
`https://api.test,mail@example.com`, redacts too, and a captured value loses all of itself rather
than part, so a `location` of `https://cdn.test//logo@2x.png` records `REDACTED` whole.

Spans are queued when the response arrives and are registered with `flush()` at call time, so
`await log.end()` delivers a `log.fetch()` you never awaited.

## Exports

| Export | |
|---|---|
| `Log` | The logger class. |
| `Queue` | The export queue; `new Queue(options)`, see [Queue exports](#queue-exports). |
| `LogLevels` | Level → OTLP `severityNumber`/`severityText`, most to least severe. |
| `msgTextFormatter`, `msgJsonFormatter` | The built-in formatters; wrap one to extend it. |
| `parseTraceparent(header)` | `{ traceId, spanId, flags, sampled }` or `null` when malformed or version `ff`. |
| `formatTraceparent(traceId, spanId, sampled?)` | Builds a W3C `traceparent` header value. |
| `generateTraceId()`, `generateSpanId()` | Random 32- and 16-hex-char ids. |
| `Logger` | The six level methods and `enabled(level)`. Accept this in library code. |
| `LogInt` | `Logger` plus `fetch`, `traceparent`, `end({ error }?)`, `flush`, `conf`, `sampled`, `span`. What `parentLog` takes. |
| `LogConf`, `ResolvedLogConf` | The options object; `ResolvedLogConf` is `log.conf` with defaults applied. |
| `LogLevel`, `LogShorthand` | Level name union; the signature of one level method. |
| `Metadata`, `MetadataValue` | `Record<string, string \| number \| boolean \| undefined>` and its value type. |
| `DefinedMetadata` | `Metadata` without `undefined` values: what a formatter and `log.context` see. |
| `EntryFormatter`, `EntryFormatterConf` | A formatter, `(entry) => string`, and the entry it takes: `{ colors? (unset = on), logLevel, metadata?, msg, msTimestamp? }`. |
| `OtlpSpan`, `OtlpAttribute`, `OtlpLogPayload`, `OtlpSpanPayload` | The OTLP wire shapes; `log.span` is an `OtlpSpan`. |
| `OtlpQueue`, `OtlpPayload` | What `otlpQueue` takes, `{ enqueue, flush }`, and what `enqueue` receives, a log or span payload. |
| `Clock`, `TimerHandle` | The `clock` option, `{ now, setTimeout, clearTimeout }` with `now()` in integer epoch milliseconds, and what its `setTimeout` hands back. |
| `QueueConf`, `ResolvedQueueConf`, `QueueStorage` | `Queue`'s options, `queue.conf` with defaults applied, and the `storage` shape, `{ getItem, setItem, removeItem }`. |

Instance fields: `log.conf`, `log.context`, `log.span`, `log.sampled`, `log.ended`.

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
