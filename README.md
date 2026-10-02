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
[Options](#options) · [Output formats](#output-formats) · [`log.fetch` in depth](#logfetch-in-depth) ·
[Footprint](#footprint) · [Exports](#exports) ·
[Development](#development) · [Changelog](CHANGELOG.md)

## Goals

In priority order; the earlier goal wins a tie.

1. **Runs everywhere.** Node, Bun, Deno, browsers and React Native.
   1. **Behaves the same everywhere,** except where a runtime genuinely differs: then the platform
      wins and the docs say so.
2. **Correct OTLP.** Leave out what cannot be done to the spec.
3. **[Credentials never leave](#credentials-in-a-captured-value).** Text you log is exported as
   written.
4. **[Semver, read strictly](#audience).**
5. **A very easy API.** Nobody learns OTLP to log.
6. **Composable.** Instances nest, inherit, and attach to an upstream trace.
7. **[Low footprint](#footprint).**
   1. **Never holds a process open** past the work the app asked for.
8. **A maintainer can hold it in their head.**

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

**Rely on** what this README documents, under semver read strictly. A minor only adds — an export,
an option, a value an option accepts, a field, a span attribute — where code not using it behaves
as before. A break is deprecated in a minor first and lands in the next major
with a `MIGRATION.md` entry; a feature whose right shape breaks waits for that major, never shipping
early in a worse one. Only a major changes:

- each documented option, read back under its own name, and each documented instance field;
- each span attribute and value this README documents, on `log.span` and on the wire;
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
- delivery: the export queue is best-effort, it keeps what `storage` accepted and drops the oldest
  past `maxItems`, keeping a batch it has promised to retry, because telemetry is not payload data;
- the text output line, which is written for people to read — parse `format: "json"` instead.

A major stops being maintained when the next one ships.

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

A child inherits every option it does not set itself, `spanName` included; `traceparent` never, and
the OTLP options as [Options](#options) says. Setting `context` on a child replaces the
parent's rather than merging, hence the spread above. The `service.name` context key becomes the
OTLP resource's service name (default `"unnamed-service"`) rather than a per-entry attribute. A
child's log entries attach to the parent's span; the child's own span holds its timing and is
exported by `end()`.

`end()` closes the span, queues it and flushes the [export queue](#queue-exports); a span that is
never ended is never sent. `end({ error })` also marks the span failed: status `ERROR` with the
error's message, and an `error.type` attribute from its string `code`, else `name`, else `"_OTHER"`;
a `null` or `undefined` error is a plain `end()`. A message that is a url is redacted, see
[Credentials in a captured value](#credentials-in-a-captured-value); keep credentials out of any
other error message. A logged `log.error()` never fails the span. `await` it to make one delivery
attempt before the process exits (a short-lived script); fire-and-forget is fine in a long-running
process. Against a dead collector `await end()` returns after that attempt, within about 3 s plus
however long any un-awaited `log.fetch()` takes to complete, and returns at once while a retry
backoff is pending. An instance is single-use: logging and `fetch()` on an ended instance throw,
`end()` rejects. `log.flush()` delivers what is queued without ending.

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
an untrusted header is safe to pass.

An unsampled header (flags `00`) is honoured: the instance and its children export no spans, and
`log.traceparent()` and `log.fetch` pass `00` on; `log.sampled` is `false`. Log records still
export.

## Queue exports

Every record and span goes through an export queue. `otlpHttpBaseURI` builds one, shared by every
child and clone that sets no `otlp*` option of its own, so one process sends few POSTs and retries a
batch the collector did not accept with backoff. Configure it yourself to persist the queue or to
tune it:

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
collector is local or on a network you trust. Either one sent over `http:` to a host other than
`localhost`, `127.0.0.0/8` or `::1` writes one `@larvit/log:` line per `report` function, host and
credential source, naming the host, and still sends. On a network you trust, pass
`acceptPlainHttpAuthorization: true` to the `Queue`; a `Log` using `otlpHttpBaseURI` moves its
`otlp*` options to `otlpQueue: new Queue({ acceptPlainHttpAuthorization: true, otlpHttpBaseURI })`,
whose report lines then go to that queue's `report`, `console.error` unless you pass one.

| Option | Type | Default | |
|---|---|---|---|
| `acceptPlainHttpAuthorization` | `boolean` | `false` | Silences the line an `Authorization` over plain `http:` writes, for a collector on a network you trust. |
| `batchDelayMs` | `number` | `1000` | How long a queued item waits for company before a send. |
| `clock` | `Clock` | system clock | `{ now, setTimeout, clearTimeout }` behind the batch, retry and send-timeout timers. Supply one to control time: a deterministic test, or a corrected `now()`. |
| `key` | `string` | `"@larvit/log:otlp-queue"` | The `storage` key. |
| `maxBatchBytes` | `number` | `65536` | Items per POST are cut here, measured as their JSON size. The default is the browser `keepalive` limit; a batch over 64 KiB is sent without `keepalive`. |
| `maxItems` | `number` | `1000` | Queue bound. The oldest items are dropped when exceeded, reported in one stderr line with the count. |
| `otlpAdditionalHeaders` | `Record<string, string>` | none | Extra headers on every request, e.g. `{ Authorization: "Bearer …" }`, read afresh each send so a rotated token takes effect. The queue sets `Content-Type`, and `Authorization` when the endpoint carries `user:pass@`; a name here replaces it, matched case-insensitively. A name or value the runtime rejects drops that batch with one report line naming it. `queue.conf` and `log.conf` keep the headers as you gave them, so don't log either. |
| `otlpHttpBaseURI` | `string` | required | OTLP/HTTP endpoint, e.g. `http://127.0.0.1:4318`. Logs go to `/v1/logs`, spans to `/v1/traces` under it; a base path is kept. `user:pass@` in it becomes an `Authorization: Basic` header, percent-decoded, and never rides in the request url — percent-encode any `/ ? #` in the password, and a literal `%` as `%25`. `queue.conf` and `log.conf` keep the URI as you gave it, so don't log either. A malformed URI, or one that is not `http:`/`https:`, throws in the constructor. |
| `otlpProtocol` | `"http/json" \| "http/protobuf"` | `"http/json"` | Wire format. Both use the same endpoint; use protobuf for collectors that reject JSON. |
| `report` | `(msg, metadata) => void` | `console.error` | Sink for one line per failed attempt, dropped batch, drop round, partially rejected batch or storage failure, and once per host and credential source for an `Authorization` over plain `http:`. The `Log`-built queue writes through the instance's `stderr` and formatter, that last line at `warn` and the rest at `error`. |
| `retryDelayMs` | `number` | `1000` | Delay before the first retry; doubles per consecutive failure, capped at 30 s. |
| `storage` | `QueueStorage` | none | Persists the queue, see above. |

A send has a 3 s timeout. Any 2xx is success; a JSON response whose `partialSuccess` has a rejected
count is reported with the count and the collector's message, and the batch is not resent. A
network error, timeout, 408, 429 or 5xx keeps the batch for retry; any other non-2xx drops it. A
retry timer never keeps a Node or Deno process alive, so a script whose first attempt fails loses
the batch at exit, `await end()` or not; give the queue a `storage` to carry it into the next run.
In a short-lived script, `await end()` before exit: it sends what is queued at once. Until 2.5.0 a
pending batch timer also holds a Node or Deno process for up to `batchDelayMs`.

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
consumer's level, sinks and OTLP settings, so a `"none"` consumer stays silent. Never `end()` the
instance you were handed; it is single-use and the consumer owns it.

## Options

`new Log(options)` or `new Log()`, `options` a `LogOptions`. Every option is optional. A level string in place of the object,
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
| `context` | `MetadataInput` | `{}` | Added to every entry. Wins over a per-call key of the same name. An `undefined` key is dropped, so `log.conf.context` reads back as `Metadata`. |
| `entryFormatter` | `EntryFormatter` | none | Deprecated, removed in 3.0.0: pass the function as `format`. Wins over a `"text"`/`"json"` `format`; two different formatters, one per spelling, throw. On `log.conf` it reads the formatter in use, and writing it swaps it. |
| `format` | `"text" \| "json" \| EntryFormatter` | `"text"` | Console output format, or a formatter of your own. Use the entry's `msTimestamp` rather than `new Date()` so console and OTLP timestamps of one entry match. `log.conf.format` never holds a function before 3.0.0; `log.conf.entryFormatter` reads the formatter in use. Writing `"text"` or `"json"` to `log.conf.format` takes effect from the next line, unless a function formatter is set, which wins. |
| `logLevel` | `LogLevel \| "none"` | `"info"` | Minimum level to output. Any other value is kept as written, logs at `"info"` and warns once per `stderr` sink and value. |
| `otlpAdditionalHeaders` | `Record<string, string>` | none | Shorthand: the same option on the default `Queue`, see [Queue exports](#queue-exports). Not inherited by a child or clone whose `otlpHttpBaseURI` has another origin (scheme, host and port) than its source's. |
| `otlpHttpBaseURI` | `string` | none | Shorthand for `otlpQueue: new Queue({ otlpHttpBaseURI, otlpProtocol, otlpAdditionalHeaders })`. `user:pass@` in it authenticates, see [Queue exports](#queue-exports). |
| `otlpProtocol` | `"http/json" \| "http/protobuf"` | `"http/json"` | Shorthand: the same option on the default `Queue`. |
| `otlpQueue` | `OtlpQueue` | none | The [export queue](#queue-exports). Cannot be combined with the three shorthands above; on an instance given them, `log.conf.otlpQueue` reads back the queue they built. Inherited by children and clones; one that sets a shorthand instead gets a queue of its own. |
| `parentLog` | `LogInt` | none | Nest under this instance's span and inherit its options except `traceparent`. Log entries attach to the parent's span. |
| `printTraceInfo` | `boolean` | `false` | Append `spanId`, `traceId` and `spanName` to console output. |
| `spanName` | `string` | `"unnamed-span"` | The instance's span name. Inherited from `parentLog` when set there. |
| `stderr` | `(msg: string) => void` | `console.error` | Sink for `error` and `warn`. |
| `stdout` | `(msg: string) => void` | `console.log` | Sink for the other levels. |
| `traceparent` | `string` | none | Incoming W3C `traceparent` to nest under; an unsampled one (`00`) drops spans, not log records. Ignored when malformed or when `parentLog` is set. |

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

**`log.fetch` mirrors the runtime's `fetch`** ([Goals #1.1 and #5](#goals)). It takes a `string` or
`URL` and an `init`, and the response, the rejection and the promise you see are exactly what the
runtime produced. What it adds is outbound trace context and a span, and never a success the
platform would have refused. The request differs from yours only by `traceparent`, which is not
CORS-safelisted, so a cross-origin call is preflighted and needs the server to list it in
`Access-Control-Allow-Headers`. Pass `init` as a plain object: a `Request` there loses its method,
body and headers. List only valid header names to capture: an invalid one rejects the call.

Only a URL that resolves to `http:` or `https:` is traced — a relative one resolves against the page, so it is untraced where there is no
page, as on a server, and where the page is not `http:`/`https:`, as under a `file:` or app-scheme
origin. Anything else passes straight through to an untraced `fetch`: no span, and no
`traceparent` sent. The span is the only output; no log line is written.

Span attributes follow the OpenTelemetry HTTP semantic conventions:

| Attribute | Value |
|---|---|
| `http.request.method` | Request method, `GET` when unset |
| `url.full` | The URL without the outer userinfo; keep credentials out of a url nested in the path, which is exported as written. Query string dropped unless `captureQuery`, redacted as [Credentials in a captured value](#credentials-in-a-captured-value) says |
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

[Goals #3](#goals) covers userinfo in a url, a captured header value or a status message, wherever
the runtime's `URL` parses that value whole, and the values of the header names and query keys
matched below.
Anything else is exported as written, text you log yourself included.

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
  it; forwarded to `end({ error })`, that rejection exports the url's userinfo, so replace its
  message first or keep credentials out of the url. Any other header value or status message is
  exported as written, a relative `location: /cb?token=…` included, since it needs a base.

Never put credentials in the url; pass an `Authorization` header, and strip userinfo from a url you
did not build. `log.fetch` mirrors the runtime: Node and browsers refuse such a url, while React
Native hands it to the platform, where iOS sends the credentials and Android sends none, leaving
you the 401.

`REDACTED` does not always stand for a credential: a `?key=` lookup, a `?token=` pagination cursor,
a `?code=` promo code, an `?oauth=` or `?design=` flag, and the headers `www-authenticate`,
`x-idempotency-key` and `x-session-id` record it, and so does an address the runtime reads as
userinfo, as in `https://api.test,mail@example.com`.

Spans are queued when the response arrives and are registered with `flush()` at call time, so
`await log.end()` delivers a `log.fetch()` you never awaited.

## Footprint

Budgets for [Goals #7](#goals), measured on this repo's container image: ≤10 KB gzipped, ≤50 ns for
a call below `logLevel`, ≤2 µs for a console call, ≤10 µs with OTLP configured, ≤1 KB per instance,
≤1.5 KB per queued record, ≤1.5 MiB for a full 1000-item queue.

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
| `Logger` | The six level methods, taking `MetadataInput`, and `enabled(level)`. Accept this in library code. |
| `LogInt` | Six `LogShorthand` level methods plus `fetch`, `traceparent`, `end({ error }?)`, `conf`, `span`, and optional `enabled`, `flush`, `sampled`; 3.0.0 makes it `Logger` plus the rest, those three required. What `parentLog` takes. |
| `LogOptions`, `LogConf`, `ResolvedLogConf` | What `new Log()` and `clone()` take; `LogInt.conf`; `log.conf`, defaults applied. |
| `LogLevel`, `LogShorthand` | Level name union; the signature of one `LogInt` level method. |
| `Metadata`, `MetadataValue` | `Record<string, string \| number \| boolean>` and its value type: what a formatter and `log.context` see. |
| `MetadataInput` | `Metadata` whose values may be `undefined`: what `Logger`'s level methods and `LogOptions.context` accept. |
| `EntryFormatter`, `EntryFormatterConf` | A formatter, `(entry) => string`, and the entry it takes: `{ colors? (unset = on), logLevel, metadata?, msg, msTimestamp? }`. |
| `OtlpSpan`, `OtlpAttribute`, `OtlpLogPayload`, `OtlpSpanPayload` | The OTLP wire shapes; `log.span` is an `OtlpSpan`. |
| `OtlpQueue`, `OtlpPayload` | What `otlpQueue` takes, `{ enqueue, flush }`, and what `enqueue` receives, a log or span payload. |
| `Clock`, `TimerHandle` | The `clock` option, `{ now, setTimeout, clearTimeout }` with `now()` in epoch milliseconds, and what its `setTimeout` hands back. |
| `QueueConf`, `ResolvedQueueConf`, `QueueStorage` | `Queue`'s options, `queue.conf` with defaults applied, and the `storage` shape, `{ getItem, setItem, removeItem }`. |

Instance fields: `log.conf`, `log.context`, `log.span`, `log.sampled`, `log.ended`.

## Development

Everything runs in Docker with dependencies installed in the container, so no local `npm install`.
The exceptions: `npm run lint` needs Node 20+ and `npm ci` on the host, and `npm run test-otlp`
needs Node 18+ on the host.

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
