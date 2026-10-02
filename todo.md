# todo

## Scoring

`Score = -R - S/4 + 2*A + 2*G*W`

`Bar = 9`

`Next ID = 79`

| Goal | W |
|---|---|
| 1 | 1.00 |
| 1.1 | 0.95 |
| 2 | 0.90 |
| 3 | 0.85 |
| 4 | 0.80 |
| 5 | 0.75 |
| 6 | 0.70 |
| 7 | 0.65 |
| 7.1 | 0.60 |
| 8 | 0.55 |

## Items

| ID | Release | Exempt | Item | R | S | A | G | Goals | Score |
|---|---|---|---|---|---|---|---|---|---|
| 10 | 2.5.0 |  | **Name the instrumentation scope after this library.** | 3 | 2 | 6 | 8 | 2 | 22.9 |
| 2 | 2.5.0 | defect | **Warn once per `report` sink about an invalid name in `captureRequestHeaders` or `captureResponseHeaders`, and skip it, so it never changes a `log.fetch` result.** | 2 | 2 | 6 | 7 | 1.1, 5 | 22.8 |
| 3 | 2.5.0 | defect | **Send a `Request` passed as `init` with its own method, body, signal and other settings.** | 3 | 3 | 6 | 7 | 1.1 | 21.5 |
| 12 | 2.5.0 |  | **Let a consumer inject the `fetch` the OTLP queue sends with.** | 3 | 3 | 6 | 6 | 1, 8 | 20.2 |
| 7 | 2.5.0 | defect | **Unref the batch timer, so a pending batch never holds a Node or Deno process.** | 4 | 4 | 7 | 9 | 7.1 | 19.8 |
| 6 | 2.5.0 | decision | **Warn once per `report` sink when `otlpHttpBaseURI` carries `user:pass@` and `otlpAdditionalHeaders` sets `Authorization`.** | 2 | 2 | 5 | 6 | 3 | 17.7 |
| 8 | 2.5.0 | defect | **Keep a restored batch through the `maxItems` trim, so the retry promised for it holds.** | 4 | 3 | 7 | 4 | 1 | 17.2 |
| 9 | 2.5.0 | defect | **Keep a batch in the persisted queue until its send settles.** | 4 | 3 | 7 | 4 | 1 | 17.2 |
| 1 | 2.5.0 | decision | **Export `resolveFormatter`, so `conf.format` fully replaces the `conf.entryFormatter` alias 3.0.0 removes.** | 2 | 2 | 5 | 6 | 4, 5 | 17.1 |
| 5 | 2.5.0 |  | **Report a 401 or 403 export as `OTLP export unauthorized, batch dropped`.** | 2 | 2 | 6 | 5 | 5 | 17.0 |
| 11 | 2.5.0 | defect | **Keep a transient `storage` read failure from wiping the persisted queue.** | 4 | 4 | 7 | 4 | 1 | 17.0 |
| 13 | 2.5.0 |  | **Pin every Node base image to its full patch version, so one commit builds one image on any day.** | 1 | 2 | 3 | 7 | 7 | 13.6 |
| 22 | 2.6.0 |  | **Announce in the README and CHANGELOG that 3.0.0 stops `log.conf` and `queue.conf` handing back a credential, so a consumer reading one out of them moves to their own copy first.** | 1 | 1 | 5 | 8 | 3, 4 | 22.4 |
| 14 | 2.6.0 |  | **Deprecate `parentLog` together with `traceparent`.** | 2 | 2 | 5 | 8 | 4 | 20.3 |
| 16 | 2.6.0 |  | **Warn once when `format` is a string other than `"text"` or `"json"`.** | 1 | 1 | 5 | 7 | 4, 5 | 20.0 |
| 23 | 2.6.0 |  | **Settle one marker for a CHANGELOG entry a consumer must act on, and record it in the `AGENTS.md` line beside `### Security`.** | 1 | 1 | 5 | 7 | 4 | 20.0 |
| 20 | 2.6.0 |  | **Announce in the README and CHANGELOG that 3.0.0 gives a `log.fetch` span `end({ error })`'s `error.type`, so a query on `"20"` for an abort or `"fetch_error"` moves first.** | 1 | 1 | 4 | 8 | 4 | 19.6 |
| 19 | 2.6.0 | defect | **Leave a `Request` untraced in `log.fetch`.** | 2 | 2 | 5 | 6 | 1.1 | 18.9 |
| 15 | 2.6.0 |  | **Warn once when `colors` is unset, `process.stdout.isTTY` is false and neither `NO_COLOR` nor `FORCE_COLOR` is set, where 3.0.0 turns colour off.** | 2 | 2 | 4 | 8 | 4 | 18.3 |
| 17 | 2.6.0 |  | **Warn once when an instance with `otlpQueue` set or inherited leaves `spanName` unset.** | 2 | 2 | 4 | 8 | 4 | 18.3 |
| 25 | 2.6.0 |  | **Publish the artifact the gate tested.** | 3 | 4 | 5 | 6 | 1 | 18.0 |
| 18 | 2.6.0 |  | **Export `LogEntry` as an alias of `EntryFormatterConf`, so the 3.0.0 rename has a spelling a consumer can move to first.** | 1 | 1 | 3 | 7 | 4 | 16.0 |
| 21 | 2.6.0 |  | **Announce in the README that 3.0.0 adds a metrics kind to `OtlpPayload`, so an `OtlpQueue` implementer handles one before it arrives.** | 1 | 1 | 3 | 7 | 4 | 16.0 |
| 26 | 2.6.0 |  | **Check the footprint budget in CI, so the numbers in README → Footprint fail a build instead of going stale.** | 2 | 5 | 4 | 8 | 7 | 15.2 |
| 24 | 2.6.0 |  | **Publish an `index.js.map` that maps the published `index.js`.** | 2 | 2 | 4 | 3 | 5 | 10.0 |
| 28 | 2.7.0 |  | **Export resource attributes beyond `service.name`.** | 2 | 3 | 7 | 7 | 2 | 23.9 |
| 27 | 2.7.0 |  | **Name a `log.fetch` span and its errors as HTTP semconv does.** | 3 | 3 | 6 | 8 | 2 | 22.6 |
| 29 | 2.7.0 |  | **Export span events.** | 3 | 5 | 6 | 6 | 2 | 18.6 |
| 31 | 2.7.0 |  | **Set a log record's `flags` to the W3C trace flags.** | 2 | 2 | 4 | 7 | 2 | 18.1 |
| 30 | 2.7.0 |  | **Let a consumer sample by ratio.** | 4 | 5 | 6 | 5 | 2, 7 | 15.8 |
| 32 | 2.7.0 |  | **Propagate `tracestate`.** | 4 | 5 | 3 | 5 | 2 | 9.8 |
| 41 | 2.8.0 | principle | **Warn once about a negative, zero or `NaN` numeric `QueueConf` option, and use the default.** | 2 | 2 | 5 | 6 | 5 | 16.5 |
| 42 | 2.8.0 | defect | **Check each persisted or enqueued payload's shape, so one corrupt item never drops its batch.** | 3 | 3 | 6 | 4 | 1 | 16.2 |
| 51 | 2.8.0 | principle | **Weigh duplicate log records on a retried export.** | 3 | 4 | 4 | 6 | 2 | 14.8 |
| 40 | 2.8.0 | principle | **Make `queue.conf` read back what the queue sends with.** | 3 | 4 | 4 | 6 | 5 | 13.0 |
| 46 | 2.8.0 | principle | **Keep an injected `clock` or `stdout` that throws from escaping a level method.** | 2 | 2 | 4 | 5 | 5 | 13.0 |
| 48 | 2.8.0 | principle | **Test the untested failure paths.** | 1 | 4 | 3 | 4 | 2, 8 | 11.2 |
| 50 | 2.8.0 | principle | **Weigh the level set, and where the queue's own failures go, against `~/.claude/principles/logging.md`.** | 2 | 2 | 3 | 4 | 5 | 9.5 |
| 34 | 2.8.0 | principle | **Let a consumer inject the randomness trace and span ids come from.** | 2 | 2 | 2 | 6 | 8 | 8.1 |
| 35 | 2.8.0 | principle | **Let a consumer inject what `colorsFromEnv`, `traceableUrl` and `unref` read from the platform.** | 3 | 4 | 2 | 6 | 8 | 6.6 |
| 37 | 2.8.0 | principle | **Build a span payload without writing to `log.span`.** | 2 | 2 | 1 | 6 | 8 | 6.1 |
| 47 | 2.8.0 | principle | **Collapse `entryFormatterDeprecation` and `load()` to one error channel each.** | 2 | 2 | 1 | 5 | 8 | 5.0 |
| 39 | 2.8.0 | principle | **Keep a `Queue`'s items and their byte count in one structure.** | 3 | 3 | 1 | 6 | 8 | 4.9 |
| 45 | 2.8.0 | principle | **Build the shared parts of a span and of a payload's attributes once.** | 2 | 3 | 1 | 5 | 8 | 4.8 |
| 44 | 2.8.0 | principle | **Route a `Queue`'s warnings through one explicit seam.** | 3 | 4 | 1 | 6 | 8 | 4.6 |
| 38 | 2.8.0 | principle | **Resolve a `Log`'s conf in steps that each return a new value, with no cast at the end.** | 4 | 5 | 1 | 7 | 8 | 4.5 |
| 43 | 2.8.0 | principle | **Give `ExportScheduler` and save coalescing named states.** | 4 | 5 | 1 | 7 | 8 | 4.5 |
| 36 | 2.8.0 | principle | **Reach the retry decision and a `log.fetch` span's attributes without a network call.** | 3 | 5 | 1 | 6 | 8 | 4.4 |
| 49 | 2.8.0 | principle | **Sort what carries no order.** | 1 | 1 | 1 | 3 | 8 | 4.1 |
| 78 | 3.0.0 |  | **Write `MIGRATION.md`: one entry per 3.0.0 item, with the 2.x spelling and the 3.0.0 spelling.** | 1 | 3 | 8 | 9 | 4 | 28.6 |
| 69 | 3.0.0 |  | **Export metadata as typed OTLP attribute values instead of coercing every one to `stringValue`.** | 3 | 3 | 7 | 8 | 2 | 24.6 |
| 71 | 3.0.0 |  | **Allow `parentLog` with `traceparent`.** | 3 | 3 | 7 | 8 | 6 | 21.4 |
| 66 | 3.0.0 |  | **Attach a child's log records to its own span instead of the parent's.** | 3 | 2 | 5 | 8 | 2 | 20.9 |
| 75 | 3.0.0 | decision | **Keep credentials off `log.conf` and `queue.conf`.** | 3 | 3 | 6 | 7 | 3 | 20.1 |
| 73 | 3.0.0 |  | **Send `traceparent` cross-origin only to urls the caller lists, or record why not.** | 3 | 3 | 5 | 7 | 1.1 | 19.5 |
| 72 | 3.0.0 |  | **Make nothing throw after `end()`.** | 3 | 4 | 6 | 7 | 5 | 18.5 |
| 52 | 3.0.0 |  | **Spell a redacted `url.full` the way OTel semconv asks: `https://REDACTED:REDACTED@host/x`.** | 2 | 2 | 4 | 7 | 2, 3 | 18.1 |
| 57 | 3.0.0 |  | **Retry only what OTLP/HTTP calls retryable — 429, 502, 503 and 504 — and honour `Retry-After`.** | 2 | 2 | 4 | 7 | 2 | 18.1 |
| 77 | 3.0.0 |  | **Require `spanName` whenever `otlpQueue` is set or inherited.** | 2 | 1 | 4 | 6 | 2 | 16.6 |
| 59 | 3.0.0 |  | **Give a `log.fetch` span `end({ error })`'s `error.type`: a string `code`, else `name`, else `"_OTHER"`.** | 2 | 2 | 4 | 6 | 2 | 16.3 |
| 53 | 3.0.0 |  | **Keep the auth scheme when an allow-listed `authorization` records `REDACTED`.** | 2 | 2 | 5 | 5 | 3 | 16.0 |
| 65 | 3.0.0 | decision | **Default `colors` to `process.stdout.isTTY` when neither `NO_COLOR` nor `FORCE_COLOR` is set.** | 3 | 2 | 5 | 6 | 5 | 15.5 |
| 56 | 3.0.0 | decision | **Export OTLP metrics as a stateless pass-through.** | 4 | 7 | 6 | 5 | 2 | 15.2 |
| 64 | 3.0.0 |  | **Reject a `format` string other than `"text"` or `"json"` in the constructor.** | 2 | 1 | 4 | 6 | 5 | 14.8 |
| 76 | 3.0.0 | decision | **Reject `user:pass@` in `otlpHttpBaseURI` beside an `Authorization` in `otlpAdditionalHeaders`, in the constructor.** | 2 | 1 | 4 | 6 | 5 | 14.8 |
| 61 | 3.0.0 | decision | **Remove the level-string shorthand from `Log` and `clone`.** | 2 | 1 | 3 | 7 | 5 | 14.2 |
| 70 | 3.0.0 |  | **Stop a child inheriting `spanName`.** | 2 | 1 | 4 | 6 | 6 | 14.1 |
| 60 | 3.0.0 |  | **Make `LogInt` `Logger` plus its own members, `enabled`, `flush` and `sampled` required.** | 2 | 2 | 4 | 6 | 6 | 13.9 |
| 67 | 3.0.0 |  | **Let per-call metadata win over `context` on a key collision.** | 2 | 1 | 4 | 5 | 5 | 13.2 |
| 55 | 3.0.0 | principle | **Make `log.span` and `ended` read-only, and an open span carry no end time.** | 3 | 3 | 3 | 6 | 2 | 13.1 |
| 62 | 3.0.0 | decision | **Remove `entryFormatter`, the option and the `conf` alias of `format` beside it.** | 3 | 3 | 3 | 7 | 5 | 12.8 |
| 58 | 3.0.0 |  | **Give the redaction sentinel its own name — `REDACTED by @larvit/log` or similar.** | 2 | 2 | 4 | 4 | 2 | 12.7 |
| 68 | 3.0.0 |  | **Merge a child's `context` per key with the parent's, as `clone()` does.** | 3 | 3 | 4 | 6 | 6 | 12.6 |
| 63 | 3.0.0 |  | **Rename `EntryFormatterConf` to `LogEntry`.** | 2 | 2 | 3 | 6 | 5 | 12.5 |
| 54 | 3.0.0 | principle | **Require `msTimestamp` in `EntryFormatterConf`, and have the built-in formatters return a value for an unknown level.** | 2 | 2 | 3 | 5 | 5 | 11.0 |
| 74 | 3.0.0 | decision | **Keep `otlpQueue` as the only OTLP representation in `conf`.** | 4 | 4 | 3 | 6 | 6 | 9.4 |

## Details

### 10. Name the instrumentation scope after this library.

Today `scope.name` is the span name, and batch merging splits `scopeSpans` by it, where OTel's scope
identifies the instrumenting code. The README documents neither, so it ships in a minor.

### 2. Warn once per `report` sink about an invalid name in `captureRequestHeaders` or `captureResponseHeaders`, and skip it, so it never changes a `log.fetch` result.

Landing it drops README → `log.fetch` in depth's "Until 2.5.0, an invalid name" sentence.
`headers.get("x y")` throws a `TypeError`, so a bad request-side name rejects every traced call
before the request goes out, and a bad response-side one turns a response the platform delivered
into a rejection.

### 3. Send a `Request` passed as `init` with its own method, body, signal and other settings.

Landing it drops README → `log.fetch` in depth's "Until 2.5.0, a `Request`" sentence. `fetch(url,
request)` is valid and TypeScript accepts it, but `{ ...init, headers }` copies own properties only,
and a `Request`'s are prototype getters: `log.fetch(url, new Request(url, { method: "POST", body
}))` sends a GET with no body. A `Request` as the *input* is 2.6.0's item.

### 12. Let a consumer inject the `fetch` the OTLP queue sends with.

The queue and `log.fetch` both reach for the global, the one un-injected seam in a library that
injects `stdout`, `stderr`, `clock`, `storage`, `report` and `otlpQueue` — and the suite pays for it
by swapping `globalThis.fetch`, process-global state nothing can run beside. A React Native app that
pins TLS or uses `expo/fetch` cannot route the exporter, the one request that crosses a hostile
network, through it. Scope as `QueueConf.fetch`; whether `log.fetch` takes one is a separate
question, since README → `log.fetch` in depth says it mirrors the runtime and an injected fetch
becomes the runtime.

### 7. Unref the batch timer, so a pending batch never holds a Node or Deno process.

Landing it drops README → Queue exports' "Until 2.5.0" sentence. README → Goals #7.1 asks for it.
Today only the retry timer is unref'd, so any pending batch holds the process for up to
`batchDelayMs`, and `round()` clears the batch timer once, at its start, so a record logged while an
export is in flight leaves one behind with nothing to send: measured on `node:22`, `await
log.flush()` returned with both records delivered and the process stayed alive a further 4.7 s of a
5 s `batchDelayMs`. 2.4.0 closes the failed-round half. A script that awaits neither `end()` nor
`flush()` then exits without exporting what it queued, so the CHANGELOG says so, and README → Queue
exports' "A retry timer never keeps…" covers every timer.

### 6. Warn once per `report` sink when `otlpHttpBaseURI` carries `user:pass@` and `otlpAdditionalHeaders` sets `Authorization`.

The two can disagree, and v2.4.0 documents the header winning. Decided 2026-09-28.

### 8. Keep a restored batch through the `maxItems` trim, so the retry promised for it holds.

README → Audience says so. `prepend(batch)` unshifts a failed batch to the front, and the `maxItems`
trim then splices the excess off that same front. An offline phone at `maxItems` reports "OTLP
export failed, will retry" for items it has already discarded, and the retry finds them gone — so
the round trip and the promise are both spent on the flagship offline path.

### 9. Keep a batch in the persisted queue until its send settles.

`takeBatch` removes it from `items` before `send`, so a record logged during the send saves the
queue without it, and a process that dies then loses the batch its storage exists to keep.

### 1. Export `resolveFormatter`, so `conf.format` fully replaces the `conf.entryFormatter` alias 3.0.0 removes.

The alias hands back a callable `EntryFormatter`; 3.0.0's `format` hands back `"text" | "json" |
EntryFormatter`, and the mapping between them is the unexported `formatterOf`. Decided 2026-09-28.

### 5. Report a 401 or 403 export as `OTLP export unauthorized, batch dropped`.

Working auth makes a wrong credential reachable for the first time, and it is the likeliest
misconfiguration of `otlpHttpBaseURI` userinfo; today it reads as any other 4xx.

### 11. Keep a transient `storage` read failure from wiping the persisted queue.

`load()` treats an unreadable `getItem` and corrupt content identically and then calls `removeItem`,
so one flaky AsyncStorage read at startup loses everything a phone held offline. The full fix is
larger than skipping the remove: after a failed load the first `save` overwrites the key anyway, so
a load failure has to suppress saving too.

### 13. Pin every Node base image to its full patch version, so one commit builds one image on any day.

Three places float: `ARG BASE_IMAGE=node:24-bookworm-slim` in the `Dockerfile`,
`${NODE_IMAGE:-node:22-bookworm-slim}` in `test-docker`, and the major-only `node-version` matrix
`push.yaml` builds its `NODE_IMAGE` from. The first two are one default written twice at two
versions, so drop the npm script's and leave the `ARG`. Renovate already bumps a `Dockerfile` pin; a
matrix of patch versions needs a `customManagers` rule to get the same.

### 14. Deprecate `parentLog` together with `traceparent`.

Today `traceparent` is silently ignored.

### 16. Warn once when `format` is a string other than `"text"` or `"json"`.

Today it falls back to text unsignalled: `new Log({ format: process.env.LOG_FORMAT })` logs text for
`"pretty"`.

### 23. Settle one marker for a CHANGELOG entry a consumer must act on, and record it in the `AGENTS.md` line beside `### Security`.

Two spellings exist: the `**Breaking:**` prefix `v2.0.0` uses, and the `### Security` grouping.
Neither covers a deprecation, so `entryFormatter` and the `new Log("debug")` shorthand tell a
consumer their code stops working in 3.0.0 from inside `### Everything else`, unmarked.

### 20. Announce in the README and CHANGELOG that 3.0.0 gives a `log.fetch` span `end({ error })`'s `error.type`, so a query on `"20"` for an abort or `"fetch_error"` moves first.

A numeric `code` gives way to `name` and the fallback becomes semconv's `"_OTHER"`.

### 19. Leave a `Request` untraced in `log.fetch`.

A JS consumer passing one gets `String(request)` = `"[object Request]"`, which in a browser resolves
against `location.href` to an http(s) url: `log.fetch` then traces that invented url and fetches it
with `init` alone, dropping the request's own method, body and headers. The signature says `string |
URL`, so a TypeScript consumer cannot reach it.

### 17. Warn once when an instance with `otlpQueue` set or inherited leaves `spanName` unset.

3.0.0 rejects it in the constructor — the only 3.0.0 break that starts throwing with no warning
planned ahead of it.

### 25. Publish the artifact the gate tested.

`push.yaml` builds and tests `index.js` inside the container; `publish.yaml` builds a second one on
the runner and publishes that, so the thing consumers install is never the thing CI proved. Build
once, upload, publish that. Pinning the base images above is the other half of the same problem.

### 26. Check the footprint budget in CI, so the numbers in README → Footprint fail a build instead of going stale.

Bundle size is the easy half; the per-operation figures need a stable enough harness to not flake.

### 24. Publish an `index.js.map` that maps the published `index.js`.

It describes tsc's output, which uglify then minifies and, since 2.5.0, mangles.

### 28. Export resource attributes beyond `service.name`.

`service.version` and `deployment.environment` are what the telemetry reader groups on in Grafana,
and the shape is a map on the resource we already build.

### 27. Name a `log.fetch` span and its errors as HTTP semconv does.

That is `{method}` alone without a url template, where today it is `{method} {host}`; an unknown
method as `_OTHER` with `http.request.method_original`; and `error.type` set to the status code on a
4xx or 5xx.

### 29. Export span events.

A reader expects to find the exception on an errored span, and the OTLP shape carries a
dropped-count we would owe them.

### 31. Set a log record's `flags` to the W3C trace flags.

An unsampled request's records export without their span, and nothing on them tells the backend that
span will never arrive.

### 30. Let a consumer sample by ratio.

A fleet of phones on cellular has no way to cap what it sends, so the 1000-item queue bound is a
sampling decision made by accident. An incoming `traceparent` flag still wins where there is one.

### 32. Propagate `tracestate`.

It is invisible when unused, and the W3C rules it must hold to — 512-char limit, list-member
ordering, the `ot` vendor key — are where the cost sits.

### 41. Warn once about a negative, zero or `NaN` numeric `QueueConf` option, and use the default.

A negative `retryDelayMs` retries at once, `maxItems: 0` drops everything, a `NaN` `maxBatchBytes`
never flushes on size. 3.0.0 rejects them. Principle: Validate data and build DTOs as early as
possible.

### 42. Check each persisted or enqueued payload's shape, so one corrupt item never drops its batch.

`isOtlpPayload` checks the top-level array only; `mergePayloads` then throws and every valid record
merged with it is lost, on the offline phone path. Principle: Validate data and build DTOs as early
as possible.

### 51. Weigh duplicate log records on a retried export.

A timeout or 5xx after the collector accepted a batch sends it again; spans dedupe by id, records do
not, and OTLP has no idempotency key. Principle: Idempotent data writing.

### 40. Make `queue.conf` read back what the queue sends with.

A write to `otlpHttpBaseURI`, `otlpProtocol` or `acceptPlainHttpAuthorization` changes nothing the
sender froze, and a replaced `storage` is saved to a store it was never loaded from. Principle:
Don't Repeat Yourself: two spellings that can disagree.

### 46. Keep an injected `clock` or `stdout` that throws from escaping a level method.

`log.fetch` guards the same failure; `log.info` lets it through to the app. Principle: Handle errors
explicitly, as values.

### 48. Test the untested failure paths.

An unencodable payload, the 3 s send abort, `unref`'s effect, the clock-shape rejection, a malformed
`%` in the endpoint password, stored JSON that is not a list, a throwing `removeItem`, retries on
408/429/500, `end()` twice, and a level method after `end()`. Principle: Most, if not all, code
should have automated tests.

### 50. Weigh the level set, and where the queue's own failures go, against `~/.claude/principles/logging.md`.

It names five levels where this has six, `verbose` exports in `debug`'s severity band, the queue's
own failures log at `error` where the app still works, `error` and `warn` go to `stderr` where the
principle says OTLP or stdout, and nothing turns the console off beside OTLP. Principle:
`~/.claude/principles/logging.md`.

### 34. Let a consumer inject the randomness trace and span ids come from.

`getRandomBytes` reads `globalThis.crypto`, else `Math.random`, so a test checks ids by regex and
"differs" only. Principle: Functional core, imperative shell.

### 35. Let a consumer inject what `colorsFromEnv`, `traceableUrl` and `unref` read from the platform.

They read `process.env`, `globalThis.location` and `globalThis.Deno`, and the suite swaps
`globalThis.process` and `console.error` to reach them. Principle: Functional core, imperative
shell.

### 37. Build a span payload without writing to `log.span`.

`buildSpanPayload` sets `span.attributes` as it builds. Principle: One owner per value.

### 47. Collapse `entryFormatterDeprecation` and `load()` to one error channel each.

One returns a warning and throws; the other throws into its own catch as a goto. Principle: Handle
errors explicitly, as values.

### 39. Keep a `Queue`'s items and their byte count in one structure.

Four writers keep `items` and `bytes` in step by hand, and the size-triggered flush trusts them.
Principle: One owner per value.

### 45. Build the shared parts of a span and of a payload's attributes once.

`openSpan` and `childSpan` repeat the span object; both payload builders drop `service.name` and
stringify values. Principle: Don't Repeat Yourself.

### 44. Route a `Queue`'s warnings through one explicit seam.

`logWarningOfReport` finds a Log's warner by the identity of its `report` function, and
`warnOnce(conf)` and `Queue.warnOnce` are two once-only rules. Principle: Explicit over implicit.

### 38. Resolve a `Log`'s conf in steps that each return a new value, with no cast at the end.

`confFromOptions`, `inheritSettings`, `rejectQueueBesideShorthand` and `withDefaults` mutate one
object in an order that carries meaning, and `conf as ResolvedLogConf` hides what they miss.
Principle: Compose, do not entangle; validate data and build DTOs as early as possible.

### 43. Give `ExportScheduler` and save coalescing named states.

`timer.retry`, `running`, `pending` and `failures`, and `dirty` with `saving`, combine into states
nobody named; the batch timer left behind mid-round is one of them. Principle: Always use explicit
state machines.

### 36. Reach the retry decision and a `log.fetch` span's attributes without a network call.

`OtlpSender.send` holds the plain-http warning, encoding, the send and the status decision in one
method, and `tracedFetch` builds and redacts attributes around the live call. Principle: Functional
core, imperative shell.

### 49. Sort what carries no order.

`format`'s `"text" | "json"`, `msg`/`msTimestamp`, and `server.port` after `url.scheme` in a
`log.fetch` span. Principle: Deterministic order wherever order carries no meaning.

### 78. Write `MIGRATION.md`: one entry per 3.0.0 item, with the 2.x spelling and the 3.0.0 spelling.

`entryFormatter` needs the pair case too: renaming the key beside a `format` string leaves two
`format` keys, and the last one wins.

### 69. Export metadata as typed OTLP attribute values instead of coercing every one to `stringValue`.

Use `boolValue` for a boolean, `intValue` for a safe integer, `doubleValue` for any other number, so
OTLP carries what the JSON formatter already emits. Breaking because a backend that indexed these as
strings re-types the field, and queries and dashboards built on the string change with it.

### 71. Allow `parentLog` with `traceparent`.

Settings inherit from `parentLog`, the span nests under the upstream `traceparent`. This is the
request-handler case; today it silently loses the trace.

### 66. Attach a child's log records to its own span instead of the parent's.

OTel's rule is that a record carries the active span, and a child's `log.fetch` spans already nest
under it. No test asserts the old behaviour; write one for the new rule first.

### 75. Keep credentials off `log.conf` and `queue.conf`.

`otlpHttpBaseURI`'s `user:pass@` and an `otlpAdditionalHeaders` bearer token sit there verbatim, so
a consumer who logs their own conf puts them in their log store. Goals #3 stops at what this library
emits, so this is a Goals #4 break. Item 74 clears `log.conf`; `queue.conf` still needs redacting,
or its credentials held off it.

### 73. Send `traceparent` cross-origin only to urls the caller lists, or record why not.

OTel's browser fetch instrumentation defaults that way (`propagateTraceHeaderCorsUrls`), because the
header preflights a cross-origin request; today `log.fetch` sends it everywhere, so narrowing it
changes a default.

### 72. Make nothing throw after `end()`.

Level methods still write to the console and their OTLP records attach to the ended span, entering
the queue like any other record, so the queue's size/time flush exports them with no further call.
`end()` a second time resolves `{ err }`. Add `ended` to `LogInt`. `log.fetch` on an ended log sends
untraced, where today it throws synchronously, which the runtime's `fetch` never does.

### 52. Spell a redacted `url.full` the way OTel semconv asks: `https://REDACTED:REDACTED@host/x`.

Today the userinfo is dropped silently, so a span can carry `url.full` showing a credential-free url
beside a `status.message` quoting `http://REDACTED@host/x`, and the reader is told both that
credentials were written and that they were not. Only React Native reaches it; Node and browsers
refuse the url first. README → `log.fetch` in depth documents `url.full` as the url without its
userinfo, so per Goals #4 this waits for the major.

### 57. Retry only what OTLP/HTTP calls retryable — 429, 502, 503 and 504 — and honour `Retry-After`.

Today 408, 500 and 501 retry too, and README → Queue exports documents that set, so narrowing it
waits for the major; honouring `Retry-After` alone may ship earlier.

### 77. Require `spanName` whenever `otlpQueue` is set or inherited.

A child or clone of an OTLP-configured instance must name its span, and the constructor rejects one
that does not, so no backend shows `unnamed-span`.

### 53. Keep the auth scheme when an allow-listed `authorization` records `REDACTED`.

`Bearer REDACTED` and `Basic REDACTED` tell a reader chasing a 401 whether the caller sent the wrong
kind of credential, and RFC 9110's `auth-scheme` is a fixed token, never the secret. Split on the
first space and keep the prefix only where it matches the token grammar. README documents the value
as `REDACTED`, so per Goals #4 this waits for the major.

### 65. Default `colors` to `process.stdout.isTTY` when neither `NO_COLOR` nor `FORCE_COLOR` is set.

A browser, with no `process`, defaults to off. The TTY detection and its tests are in commit
9706b0a.

### 56. Export OTLP metrics as a stateless pass-through.

That is a metrics kind in `OtlpPayload`, batched through `Queue` and POSTed to `/v1/metrics`, with
the types carrying what a valid point must have. It waits for the major because an `OtlpQueue`
implementer receives the wider union. Measure what the metrics messages add to the protobuf encoder
against the 10 KB budget before deciding.

### 76. Reject `user:pass@` in `otlpHttpBaseURI` beside an `Authorization` in `otlpAdditionalHeaders`, in the constructor.

2.5.0 warns first.

### 70. Stop a child inheriting `spanName`.

Default to `"unnamed-span"` for both derivations.

### 67. Let per-call metadata win over `context` on a key collision.

The more specific value wins; today `context` wins.

### 55. Make `log.span` and `ended` read-only, and an open span carry no end time.

Anyone handed a `LogInt` can rewrite what is exported, `log.ended = false` exports a span twice, and
an open span reads as a finished zero-length one. Principle: One owner per value.

### 62. Remove `entryFormatter`, the option and the `conf` alias of `format` beside it.

`format` is `"text" | "json" | ((entry) => string)`. This closes the one unsoundness 2.4.0 could
not: the alias is non-enumerable, so `ResolvedLogConf` declares a member a spread of a conf does not
carry.

### 58. Give the redaction sentinel its own name — `REDACTED by @larvit/log` or similar.

Today one token means three things to the telemetry reader: a header redacted by name, a value that
matched a credential shape, and a value the consumer's own app had already redacted upstream.
`REDACTED` shipped in 2.3.0 and README → Audience promises each documented span value, so renaming
it waits for the major.

### 68. Merge a child's `context` per key with the parent's, as `clone()` does.

Today a child's `context` replaces the parent's wholesale. Settle first which parent value merges: a
clone takes the live `log.context`, a child today reads `conf.context`, so they differ once
`log.context` is written to.

### 63. Rename `EntryFormatterConf` to `LogEntry`.

It is an entry, and the option it was named after is gone.

### 54. Require `msTimestamp` in `EntryFormatterConf`, and have the built-in formatters return a value for an unknown level.

Today they fall back to `Date.now()`, bypassing `clock`, and `msgTextFormatter` throws. Principle:
Functional core, imperative shell.

### 74. Keep `otlpQueue` as the only OTLP representation in `conf`.

Build the default `Queue` from the three `otlp*` shorthands and clear them, so inheritance needs one
rule and `isQueueFor` goes. Today `log.conf.otlpHttpBaseURI` stays readable, which is why this waits
for a major.
