# todo

## Scoring

`Score = 10 * V / (R + S)`

`Bar = 0.5`

`Next ID = 154`

## Items

| ID | Release | Blocked by | Exempt | Item | L | E | I | R | S | Moves | Score |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 96 | 2.7.0 |  | owner | **Add a list of transports, each handed plain log entries it encodes itself, with console and OTLP as the two this library ships and uses by default.** | 4 | 2 | 3 | 7 | 8 | 2 by 7, 4 by 8 | 1.4 |
| 153 | 2.7.0 | 96 | owner | **Let an app export the spans OpenTelemetry's instrumentation packages record, such as pg or Prisma queries, through a `Log`, nested under the request they ran in.** | 4 | 2 | 2 | 6 | 6 | 2 by 8, 4 by 6 | 1.7 |
| 146 | 2.8.0 |  |  | **Let a reader see from `redactedPath` alone which segments of a request path it keeps.** | 2 | 2 | 4 | 6 | 2 | code health by 3 | 2.3 |
| 149 | 2.8.0 |  |  | **Keep a queue's storage read from rejecting when `restore` throws.** | 1 | 1 | 2 | 2 | 6 | code health by 3 | 2.3 |
| 114 | 2.8.0 |  |  | **Move `package.json`'s build and test one-liners into named scripts, and let the OTLP test read its collector's port, image and container name from the environment, today's values as defaults.** | 1 | 1 | 1 | 1 | 2 | code health by 1 | 2.1 |
| 139 | 2.8.0 |  | principle | **Cite "Sane defaults" as applied in the clock and randomness decision, once the principle carries its exception for a library.** | 1 | 2 | 1 | 2 | 1 | code health by 1 | 2.1 |
| 19 | 2.8.0 |  | defect | **Leave a `Request` untraced in `log.fetch`.** | 1 | 1 | 2 | 2 | 2 | 3.1 by 6 | 2.1 |
| 80 | 2.8.0 |  | principle | **Run the browser suite in WebKit and Firefox as well as Chromium.** | 2 | 1 | 1 | 2 | 3 | 3 by 7 | 2.0 |
| 28 | 2.8.0 | 96 |  | **Export resource attributes beyond `service.name`.** | 2 | 1 | 2 | 3 | 3 | 2 by 7 | 1.7 |
| 117 | 2.8.0 |  |  | **Bring the built `index.js` within README → Footprint's 10 KB gzipped budget.** | 2 | 1 | 2 | 3 | 3 | 5 by 7 | 1.5 |
| 26 | 2.8.0 |  |  | **Check the footprint budget in CI, so the numbers in README → Footprint fail a build instead of going stale.** | 2 | 1 | 1 | 2 | 5 | 5 by 8 | 1.5 |
| 88 | 2.8.0 |  |  | **Parse `traceparent` as W3C Trace Context does: ignore uppercase hex, and read a higher version by its first four fields.** | 1 | 1 | 1 | 1 | 2 | 2 by 3 | 1.5 |
| 31 | 2.8.0 | 96 |  | **Set a log record's `flags` to the W3C trace flags.** | 1 | 1 | 2 | 2 | 2 | 2 by 4 | 1.5 |
| 112 | 2.8.0 |  |  | **Run the suite on Deno and Bun in CI.** | 2 | 1 | 1 | 2 | 3 | 3 by 5 | 1.4 |
| 27 | 2.8.0 |  |  | **Name a `log.fetch` span and its errors as HTTP semconv does.** | 2 | 1 | 3 | 4 | 3 | 2 by 6 | 1.3 |
| 30 | 2.8.0 |  |  | **Let a consumer sample by ratio.** | 3 | 2 | 2 | 5 | 5 | 2 by 5, 5 by 4 | 1.3 |
| 107 | 2.8.0 |  | principle | **Run the suite on React Native's Hermes in CI.** | 3 | 1 | 1 | 3 | 5 | 3 by 7 | 1.2 |
| 81 | 2.8.0 |  | principle | **Test export and `log.fetch` against a real server in a browser.** | 2 | 1 | 1 | 2 | 5 | 3.1 by 6 | 1.2 |
| 99 | 2.8.0 | 96 |  | **Honour a collector's `Retry-After` before retrying a batch.** | 2 | 1 | 2 | 3 | 2 | 2 by 4 | 1.2 |
| 86 | 2.8.0 | 96 |  | **Set `telemetry.sdk.language` to a semconv value, `nodejs` or `webjs`.** | 1 | 1 | 2 | 2 | 2 | 2 by 3 | 1.1 |
| 29 | 2.8.0 | 96 |  | **Export span events.** | 3 | 1 | 2 | 4 | 5 | 2 by 6 | 1.0 |
| 87 | 2.8.0 | 96 |  | **Report a protobuf export's `partialSuccess` as the JSON transport does.** | 2 | 1 | 2 | 3 | 4 | 2 by 4 | 0.8 |
| 148 | 2.9.0 | 146 | owner | **Reach the comprehension floor: score the project against 7.0, and while any score is under it, file items lifting the lowest dimension, with this item's successor.** | 1 | 1 | 1 | 1 | 1 | code health by 2 | 6.2 |
| 41 | 2.9.0 |  | principle | **Warn once about a negative, zero or `NaN` numeric `QueueConf` option, and use the default.** | 1 | 1 | 1 | 1 | 2 | 1 by 5 | 2.5 |
| 20 | 2.9.0 |  |  | **Announce in the README and CHANGELOG that 3.0.0 gives a `log.fetch` span `end({ error })`'s `error.type`, so a query on `"20"` for an abort or `"fetch_error"` moves first.** | 1 | 1 | 1 | 1 | 1 | 1 by 3 | 2.3 |
| 23 | 2.9.0 |  |  | **Settle one marker for a CHANGELOG entry a consumer must act on, and record it in the `AGENTS.md` line beside `### Security`.** | 1 | 1 | 1 | 1 | 1 | 1 by 3 | 2.3 |
| 15 | 2.9.0 |  |  | **Warn once when `colors` is unset, `process.stdout.isTTY` is false and neither `NO_COLOR` nor `FORCE_COLOR` is set, where 3.0.0 turns colour off.** | 1 | 1 | 1 | 1 | 2 | 1 by 4 | 2.0 |
| 17 | 2.9.0 |  |  | **Warn once when an instance with `otlpQueue` set or inherited leaves `spanName` unset.** | 1 | 1 | 1 | 1 | 2 | 1 by 4 | 2.0 |
| 21 | 2.9.0 |  |  | **Announce in the README that 3.0.0 adds a metrics kind to `OtlpPayload`, so an `OtlpQueue` implementer handles one before it arrives.** | 1 | 1 | 1 | 1 | 1 | 4 by 3 | 2.0 |
| 22 | 2.9.0 |  |  | **Announce in the README and CHANGELOG that 3.0.0 stops `log.conf` and `queue.conf` handing back a credential, so a consumer reading one out of them moves to their own copy first.** | 1 | 2 | 1 | 2 | 1 | 1 by 3 | 1.5 |
| 24 | 2.9.0 |  |  | **End the published `index.js` with a `sourceMappingURL` comment, so a runtime loads `index.js.map` unasked.** | 1 | 1 | 1 | 1 | 2 | 1 by 3 | 1.5 |
| 46 | 2.9.0 |  | principle | **Keep an injected `clock` or `stdout` that throws from escaping a level method.** | 1 | 1 | 2 | 2 | 2 | 1 by 4 | 1.5 |
| 50 | 2.9.0 |  | principle | **Match the level set and where this library's own lines go to `~/.claude/principles/logging.md`, or record why not.** | 1 | 1 | 1 | 1 | 2 | 1 by 3 | 1.5 |
| 14 | 2.9.0 |  |  | **Deprecate `parentLog` together with `traceparent`.** | 1 | 1 | 2 | 2 | 2 | 4 by 4 | 1.3 |
| 83 | 2.9.0 |  |  | **Measure a full persisted queue's save to `localStorage` on a low-end phone, and budget it in README → Footprint.** | 1 | 2 | 1 | 2 | 3 | 5 by 5 | 1.3 |
| 40 | 2.9.0 |  | principle | **Make `queue.conf` read back what the queue sends with.** | 2 | 1 | 1 | 2 | 4 | 1 by 4 | 1.0 |
| 42 | 2.9.0 |  | defect | **Check each persisted or enqueued payload's shape, so one corrupt item never drops its batch.** | 2 | 1 | 2 | 3 | 3 | 3 by 4 | 1.0 |
| 51 | 2.9.0 |  | principle | **Keep a retried export from duplicating log records, or record in `docs/decisions.md` why duplicates stand.** | 2 | 2 | 2 | 4 | 4 | 2 by 4 | 0.7 |
| 32 | 2.9.0 |  |  | **Propagate `tracestate`.** | 3 | 2 | 2 | 5 | 5 | 2 by 4 | 0.6 |
| 55 | 3.0.0 |  | principle | **Make `log.span` and `ended` read-only, and an open span carry no end time.** | 2 | 1 | 1 | 2 | 3 | code health by 4 | 5.0 |
| 142 | 3.0.0 |  | principle | **Take `cloneOf` off `Log`'s published constructor and `warn` off `Queue`'s.** | 2 | 1 | 2 | 3 | 3 | code health by 3 | 3.1 |
| 61 | 3.0.0 |  | decision | **Remove the level-string shorthand from `Log` and `clone`.** | 1 | 1 | 2 | 2 | 1 | 1 by 4 | 2.0 |
| 64 | 3.0.0 |  |  | **Reject a `format` string other than `"text"` or `"json"` in the constructor.** | 1 | 1 | 2 | 2 | 1 | 1 by 4 | 2.0 |
| 67 | 3.0.0 |  |  | **Let per-call metadata win over `context` on a key collision.** | 1 | 1 | 2 | 2 | 1 | 1 by 4 | 2.0 |
| 76 | 3.0.0 |  | decision | **Reject `user:pass@` in `otlpHttpBaseURI` beside an `Authorization` in `otlpAdditionalHeaders`, in the constructor.** | 1 | 1 | 2 | 2 | 1 | 1 by 4 | 2.0 |
| 77 | 3.0.0 | 17 |  | **Require `spanName` whenever `otlpQueue` is set or inherited.** | 1 | 1 | 2 | 2 | 1 | 1 by 4 | 2.0 |
| 78 | 3.0.0 |  | decision | **Write `MIGRATION.md`: one entry per 3.0.0 item, with the 2.x spelling and the 3.0.0 spelling.** | 1 | 2 | 2 | 3 | 3 | 1 by 8 | 2.0 |
| 57 | 3.0.0 |  |  | **Retry only what OTLP/HTTP calls retryable: 429, 502, 503 and 504.** | 1 | 1 | 2 | 2 | 2 | 2 by 5 | 1.8 |
| 70 | 3.0.0 |  |  | **Stop a child inheriting `spanName`.** | 1 | 1 | 2 | 2 | 1 | 4 by 4 | 1.8 |
| 71 | 3.0.0 | 14 |  | **Allow `parentLog` with `traceparent`.** | 2 | 1 | 2 | 3 | 3 | 4 by 8 | 1.8 |
| 60 | 3.0.0 |  |  | **Make `LogInt` `Logger` plus its own members, `enabled`, `flush` and `sampled` required.** | 1 | 1 | 2 | 2 | 2 | 4 by 5 | 1.7 |
| 66 | 3.0.0 |  |  | **Attach a child's log records to its own span instead of the parent's.** | 2 | 1 | 2 | 3 | 2 | 4 by 6 | 1.6 |
| 53 | 3.0.0 |  |  | **Keep the auth scheme when an allow-listed `authorization` records `REDACTED`.** | 1 | 1 | 2 | 2 | 2 | 1 by 4 | 1.5 |
| 54 | 3.0.0 |  | principle | **Require `msTimestamp` in `EntryFormatterConf`, and have the built-in formatters return a value for an unknown level.** | 1 | 1 | 1 | 1 | 2 | 1 by 3 | 1.5 |
| 63 | 3.0.0 |  |  | **Rename `EntryFormatterConf` to `LogEntry`.** | 1 | 1 | 2 | 2 | 2 | 1 by 4 | 1.5 |
| 65 | 3.0.0 | 15 | decision | **Default `colors` to `process.stdout.isTTY` when neither `NO_COLOR` nor `FORCE_COLOR` is set.** | 2 | 1 | 2 | 3 | 2 | 1 by 5 | 1.5 |
| 69 | 3.0.0 |  |  | **Export metadata as typed OTLP attribute values instead of coercing every one to `stringValue`.** | 2 | 1 | 3 | 4 | 3 | 2 by 7 | 1.5 |
| 52 | 3.0.0 |  |  | **Spell a redacted `url.full` the way OTel semconv asks: `https://REDACTED:REDACTED@host/x`.** | 1 | 1 | 2 | 2 | 2 | 2 by 4 | 1.5 |
| 59 | 3.0.0 | 20 |  | **Give a `log.fetch` span `end({ error })`'s `error.type`: a string `code`, else `name`, else `"_OTHER"`.** | 1 | 1 | 2 | 2 | 2 | 2 by 4 | 1.5 |
| 72 | 3.0.0 |  |  | **Make nothing throw after `end()`.** | 2 | 1 | 2 | 3 | 4 | 1 by 6 | 1.3 |
| 58 | 3.0.0 |  |  | **Give the redaction sentinel its own name — `REDACTED by @larvit/log` or similar.** | 1 | 1 | 2 | 2 | 2 | 1 by 3 | 1.1 |
| 68 | 3.0.0 |  |  | **Merge a child's `context` per key with the parent's, as `clone()` does.** | 2 | 1 | 2 | 3 | 3 | 4 by 5 | 1.1 |
| 97 | 3.0.0 | 96 | decision | **Keep every OTLP option, type and encoding inside the OTLP transport, so no other code knows OTLP.** | 4 | 2 | 3 | 7 | 8 | 2 by 5, 4 by 6 | 1.0 |
| 62 | 3.0.0 |  | decision | **Remove `entryFormatter`, the option and the `conf` alias of `format` beside it.** | 2 | 1 | 2 | 3 | 3 | 1 by 4 | 1.0 |
| 56 | 3.0.0 | 21 | decision | **Export OTLP metrics from instruments that aggregate for the caller.** | 3 | 2 | 2 | 5 | 8 | 2 by 7 | 0.8 |
| 75 | 3.0.0 | 22 | decision | **Keep credentials off `log.conf` and `queue.conf`.** | 2 | 1 | 2 | 3 | 3 | 1 by 3 | 0.8 |
| 73 | 3.0.0 |  |  | **Send `traceparent` cross-origin only to urls the caller lists, or record why not.** | 2 | 2 | 3 | 5 | 3 | 3 by 4 | 0.7 |
| 108 | 3.0.0 |  | principle | **Keep two tabs of one web app sharing a `storage` key from sending a record twice or deleting each other's backlog.** | 3 | 2 | 2 | 5 | 5 | 3 by 5 | 0.7 |

## Details

### 96. Add a list of transports, each handed plain log entries it encodes itself, with console and OTLP as the two this library ships and uses by default.

Today a `Log` writes console output through `stdout` and `stderr`, and exports through one seam,
`otlpQueue`, that takes OTLP payloads. Serving README → Goals #2 and #4 means a consumer sends to
any set of destinations without a second library. Settled by the maintainer on 2026-10-26:

- Console output is a transport like any other.
- A transport is handed plain log entries, and encodes them itself, so writing a new one is easy and
  intuitive.
- The OTLP options, injecting the `fetch` the OTLP transport sends with among them, belong to the
  OTLP transport. That `fetch` was item 12: the queue reaches for the global `fetch`, so a React
  Native app that pins TLS or uses `expo/fetch` cannot route the exporter through it, and the suite
  swaps `globalThis.fetch`.

It ships in a 2.x minor only if it can be done cleanly under README → Goals #8: the existing options
keep working exactly as today, building the default list, and the ones it replaces are deprecated.
Otherwise it moves to 3.0.0, with the maintainer's approval. The decisions resting on "a queue owns
the transport" and "The OTLP endpoint belongs to the queue" are revised in the same change.

**Done only once the maintainer approves both** the transport configuration a consumer writes, and
examples of building a transport, each shown to them before the item is marked complete. The
spelling is benched with the README's audience before it is shown.

Let a transport skip a record kind it does not handle, so a new kind, such as item 56's metrics,
ships in a minor instead of waiting for a major.

Every seat of the 2026-10-03 comprehension run named `formatFunctions` and `defaultQueues`, two
module-level tables a reader must trace to know a `Log`'s formatter and queue. Where the console
and OTLP transports take those over, the formatter and the queue are read where they are used.

Benched on 2026-11-15 with eight fresh readers seated from README → Audience, in two rounds, and
awaiting the maintainer's approval:

- `transports: [consoleTransport({ format }), otlpTransport({ baseUrl, headers, protocol, fetch, storage })]`:
  factory functions, picked by 3 of 4 over classes. `Queue` as the OTLP transport read as a buffer,
  and `Console` as the global.
- `baseUrl`, `headers` and `protocol` inside `otlpTransport`, picked by 3 of 4. `url` and `endpoint`
  read as the full `/v1/logs` url, and the `otlp` prefix as noise there.
- A transport is an object with optional `entry(entry)`, `span(span)` and `flush()`, picked by 3 of
  4. `onEntry` read as a fire-and-forget event, and one `write(record)` breaks on a new kind.
- `transports` replaces the default list, and a child inherits its parent's list: every reader
  predicted both.
- `transports` beside an option it replaces throws, naming where the option goes: picked by 4 of 4
  over a warning or a merge.
- Deprecate only the four `otlp*` options, and keep the console options as the short way to set up
  the default console transport: picked by 3 of 4.

### 153. Let an app export the spans OpenTelemetry's instrumentation packages record, such as pg or Prisma queries, through a `Log`, nested under the request they ran in.

Database, queue and RPC calls appear in a trace today only where the app wraps each one in a span by
hand. OpenTelemetry's instrumentation packages, and libraries that call `@opentelemetry/api`
themselves, record those spans automatically, but only an app running the OpenTelemetry SDK exports
them. That data is very hard to get any other way, and it sends users to the SDK (README → Goals
#2).

Settled by the maintainer on 2026-11-14:

- It ships from this package, as a second entry point such as `@larvit/log/otel`, not as a package
  of its own: OpenTelemetry already makes an app install many packages. An app that doesn't import
  it doesn't load it, and the core's bundle and dependencies stay as they are.
- Nesting the spans uses OpenTelemetry's own context manager, which the app installs. This library
  keeps no ambient context of its own (README → Goals #10, which carves out this adapter).
- The spans must join the trace and the span of the `Log` the app handles the request with, which
  the app hands to the adapter explicitly at the request's edge.

Blocked by item 96, since these spans will flow through whatever transports it creates. README's
"One file, every runtime" claim changes with a second entry point; say what holds instead.

### 146. Let a reader see from `redactedPath` alone which segments of a request path it keeps.

The comprehension run of 2026-11-14, at 78682e7, scored Shape 6.63, and three of four seats named
`credentials/path.ts` → `redactedPath`: it picks between two candidate cuts, one at a listed key and
one at a url nested in the path whose search is bounded by the key's position, skips segment 0, and
ends in a whole-path fallback that can override either cut. A reader has to hold all three
together to say what a given path keeps.

What is redacted stays as README → "Credentials in a captured value" sets it, and a defect here
exposes a credential in an exported span's `url.full`, README → Goals #7. Against the technical
principle "Keep It Simple, Stupid", and code health.

### 149. Keep a queue's storage read from rejecting when `restore` throws.

`StoredQueue.read` (`otlp/queue/queue-storage.ts`) calls `restore`, and `Queue.restore` calls `scheduler.schedule()`, which calls the clock's `setTimeout`. Nothing on that path catches a throw. So an injected clock whose `setTimeout` throws rejects `readable` and `loaded`. That leaves `void this.write(...)` as an unhandled rejection, and rejects every round's `ready`. `ExportScheduler`'s `roundDone` step already guards against such a clock. The prose pass on item 43's chunk found this; the path predates that chunk.

### 114. Move `package.json`'s build and test one-liners into named scripts, and let the OTLP test read its collector's port, image and container name from the environment, today's values as defaults.

`build`, `build-tests`, `replace-version-string`, `test-browser`, `test-docker` and `test-otlp` chain
shell inside one JSON string. `scripts/run-otlp-tests.mjs` fixes port 4318, the image and the
container name, so two runs on one machine clash, and its `docker rm -f` removes the other run's
collector. Found by the technical principles audit on 2026-10-26.

### 139. Cite "Sane defaults" as applied in the clock and randomness decision, once the principle carries its exception for a library.

`docs/decisions.md` → "A `Log` and a `Queue` default their clock, and a `Log` its randomness"
departs from the technical principle "Sane defaults", which still has a library ask for its clock
and randomness. The exception is planned where the technical principles are kept, outside this
repo. When it lands, reword the decision to cite the principle as applied, and finish this item.
Until then the code stays: README → Goals #1 and #2 need the defaults. Found by the principles pass
of 2.6.0's release review.

### 19. Leave a `Request` untraced in `log.fetch`.

A JS consumer passing one gets `String(request)` = `"[object Request]"`, which in a browser resolves
against `location.href` to an http(s) url: `log.fetch` then traces that invented url and fetches it
with `init` alone, dropping the request's own method, body and headers. The signature says `string |
URL`, so a TypeScript consumer cannot reach it.

### 80. Run the browser suite in WebKit and Firefox as well as Chromium.

`scripts/run-browser-tests.mjs` launches Chromium alone, though its Playwright image ships both.
WebKit is the only engine on an iPhone, and `failureMessage` has a Firefox branch the suite only
fakes. `~/.claude/principles/frontend.md` → broad device support.

### 28. Export resource attributes beyond `service.name`.

`service.version` and `deployment.environment` are what the telemetry reader groups on in Grafana,
and the shape is a map on the resource we already build.

### 117. Bring the built `index.js` within README → Footprint's 10 KB gzipped budget.

README → Footprint budgets `index.js` at ≤10 KB gzipped for Goals #5. On 2026-11-10, during the
2.5.0 release review, the build was 11056 bytes: `npm run build` in the repo's container image, then
`gzip -9c index.js | wc -c`. The budget is broken, and nothing checks it. Whether to shrink the
build or re-state the budget is for this item to work out. Item 26 will check the budget in CI, and
that check will fail from its first run until this item lands. Found on 2026-10-28, at 10439 bytes.
On 2026-11-13 the bundled build was 11366 bytes, and 11668 after the release review of 2.6.0
split the credential, settings and queue modules. With `uglifyjs --toplevel` the 11366 became 10241. That flag
shortens every top-level name, keeping only the names consumers import. So `Log.name` and
`Queue.name`, which a debugger prints, are shortened too unless the build reserves them.

### 26. Check the footprint budget in CI, so the numbers in README → Footprint fail a build instead of going stale.

Bundle size is the easy half; the per-operation figures need a stable enough harness to not flake.

### 88. Parse `traceparent` as W3C Trace Context does: ignore uppercase hex, and read a higher version by its first four fields.

`parseTraceparent` lowercases its input and requires an exact length.

### 31. Set a log record's `flags` to the W3C trace flags.

An unsampled request's records export without their span, and nothing on them tells the backend that
span will never arrive.

### 112. Run the suite on Deno and Bun in CI.

README → Runtimes says Deno and Bun meet the rule and are not in CI; CI proving more runtimes is Goals #3's signal. Found by the goals principles audit on 2026-10-26.

### 27. Name a `log.fetch` span and its errors as HTTP semconv does.

That is `{method}` alone without a url template, where today it is `{method} {host}`; an unknown
method as `_OTHER` with `http.request.method_original`; and `error.type` set to the status code on a
4xx or 5xx.

### 30. Let a consumer sample by ratio.

A fleet of phones on cellular has no way to cap what it sends, so the 1000-item queue bound is a
sampling decision made by accident. An incoming `traceparent` flag still wins where there is one.

### 107. Run the suite on React Native's Hermes in CI.

README → Audience calls React Native a primary target, but CI runs Node and Chromium only, so a break
under Hermes or React Native's own globals, such as a `URL` whose getters throw, ships unseen. Items 80 and 81 don't cover
it. `~/.claude/principles/frontend.md` → Testability and broad device support.

### 81. Test export and `log.fetch` against a real server in a browser.

The browser run stubs `globalThis.fetch`, so the 64 KiB `keepalive` cap and the CORS preflight are
never exercised. Item 96 removes the global swap, not this gap. `~/.claude/principles/frontend.md` →
testability.

### 99. Honour a collector's `Retry-After` before retrying a batch.

OTLP/HTTP asks a client to wait as long as a 429 or 503 response's `Retry-After` says. Today the
queue retries on its own backoff, which can hit a throttling collector again too soon. It adds to
what the queue does, so it ships in a minor; it waits on item 96 because retries belong to the OTLP
transport.

### 86. Set `telemetry.sdk.language` to a semconv value, `nodejs` or `webjs`.

Today it is `"ecmascript"`, which a backend keying on the language does not recognise.

### 29. Export span events.

A reader expects to find the exception on an errored span, and the OTLP shape carries a
dropped-count we would owe them.

### 87. Report a protobuf export's `partialSuccess` as the JSON transport does.

Under `http/protobuf` a partially rejected batch counts as delivered.

### 148. Reach the comprehension floor: score the project against 7.0, and while any score is under it, file items lifting the lowest dimension, with this item's successor.

The latest run, at 39d7c0a on 2026-11-14 during release 2.6.1, scored Navigation 7.75, Locality
6.38, Shape 7.00, Self-sufficiency 7.00, overall 6.88. Locality is the lowest. Its seats named the
query rules in `credentials/query.ts` → `redactedSearch` and `PAIR_RULES`, with
`credentials/query-userinfo-runs.ts` → `step`, which release 2.7.0 reworked; the formatter in
`log/formatter-setting.ts` → `inheritedFormatter`, held under five names and told apart by getter
identity, with what a child inherits in `log/settings.ts` → `inherited`; and the default queue's
recognition in `log/default-queue.ts` → `isDefaultQueueFor`. Release 2.7.0 reworked both into
`log/conf.ts` and `log/default-queue.ts`. Shape's seats also named `credentials/path.ts` → `redactedPath`, item 146. No item yet
takes `credentials/span-values.ts` → `failureMessage` and `traceableUrl`, now `parseHttpUrl`,
or `credentials/text.ts` → `redactTextQueryKeys`; the 2.6.1 release review reworked
`otlp/queue/export-scheduler.ts` → `transitionRound` and `tracing/fetch.ts` → `fetchFailure`. This item's tagline names
the floor, so its chunk runs the four-seat scoring run. Where a dimension or the overall stays under
7.0, file items for the places the seats name, lowest dimension first, and a copy of this item
blocked by them. Where every score reaches 7.0, it doesn't file anything, and the run replaces the
comprehension baseline.

### 41. Warn once about a negative, zero or `NaN` numeric `QueueConf` option, and use the default.

A negative `retryDelayMs` retries at once, `maxItems: 0` drops everything, a `NaN` `maxBatchBytes`
never flushes on size. Principle: Validate data and build DTOs as early as possible.

### 20. Announce in the README and CHANGELOG that 3.0.0 gives a `log.fetch` span `end({ error })`'s `error.type`, so a query on `"20"` for an abort or `"fetch_error"` moves first.

A numeric `code` gives way to `name` and the fallback becomes semconv's `"_OTHER"`.

### 23. Settle one marker for a CHANGELOG entry a consumer must act on, and record it in the `AGENTS.md` line beside `### Security`.

Two spellings exist: the `**Breaking:**` prefix `v2.0.0` uses, and the `### Security` grouping.
Neither covers a deprecation, so `entryFormatter` and the `new Log("debug")` shorthand tell a
consumer their code stops working in 3.0.0 from inside `### Everything else`, unmarked.

### 17. Warn once when an instance with `otlpQueue` set or inherited leaves `spanName` unset.

Item 77 makes the constructor reject it in 3.0.0, and this warning is that break's only notice.

### 24. End the published `index.js` with a `sourceMappingURL` comment, so a runtime loads `index.js.map` unasked.

The map matches `index.js` since the module split of 2026-11-13, yet `index.js` doesn't name it, so
Node's `--enable-source-maps` and a browser's devtools don't load it. The comment adds about 40
bytes to a file over README → Footprint's budget (item 117).

### 46. Keep an injected `clock` or `stdout` that throws from escaping a level method.

`log.fetch` guards the same failure; `log.info` lets it through to the app. Principle: Handle errors
explicitly, as values.

### 50. Match the level set and where this library's own lines go to `~/.claude/principles/logging.md`, or record why not.

It names five levels where this has six, `verbose` exports in `debug`'s severity band, the queue's
own failures log at `error` where the app still works, `error` and `warn` go to `stderr` where the
principle says OTLP or stdout, and nothing turns the console off beside OTLP. Principle:
`~/.claude/principles/logging.md`, levels and where each goes.

### 14. Deprecate `parentLog` together with `traceparent`.

Today `traceparent` is silently ignored.

### 83. Measure a full persisted queue's save to `localStorage` on a low-end phone, and budget it in README → Footprint.

Each save stringifies the whole queue, about 1.1 MiB when full, and `localStorage` writes
synchronously on the main thread.

### 40. Make `queue.conf` read back what the queue sends with.

A write to `otlpHttpBaseURI`, `otlpProtocol` or `acceptPlainHttpCredentials` doesn't change anything the
sender froze, and a replaced `storage` is saved to a store it was never loaded from. Principle:
Don't Repeat Yourself (two spellings that can disagree).

### 42. Check each persisted or enqueued payload's shape, so one corrupt item never drops its batch.

`isOtlpPayload` checks the top-level array only; `mergePayloads` then throws and every valid record
merged with it is lost, on the offline phone path. Principle: Validate data and build DTOs as early
as possible.

### 51. Keep a retried export from duplicating log records, or record in `docs/decisions.md` why duplicates stand.

A timeout or 5xx after the collector accepted a batch sends it again; spans dedupe by id, records do
not, and OTLP has no idempotency key. Principle: Idempotent data writing.

### 32. Propagate `tracestate`.

It is invisible when unused, and the W3C rules it must hold to — 512-char limit, list-member
ordering, the `ot` vendor key — are where the cost sits.

### 55. Make `log.span` and `ended` read-only, and an open span carry no end time.

Anyone handed a `LogInt` can rewrite what is exported, `log.ended = false` exports a span twice, and
an open span reads as a finished zero-length one. Principle: One owner per value.

### 142. Take `cloneOf` off `Log`'s published constructor and `warn` off `Queue`'s.

Each is a second constructor parameter only this library passes, marked "Not part of the API" in
its JSDoc: `clone()` hands `Log` the `Log` it clones, and a `Log` hands the queue it builds the
function that writes its warnings. A consumer can still pass either, and `cloneOf` silently turns
`new Log` into a clone. Removing a parameter from a published signature needs a major. Against the
technical principles "Make invalid states unrepresentable" and "Explicit over implicit". Found by
the principles pass of 2.6.0's release review.

### 67. Let per-call metadata win over `context` on a key collision.

The more specific value wins; today `context` wins.

### 76. Reject `user:pass@` in `otlpHttpBaseURI` beside an `Authorization` in `otlpAdditionalHeaders`, in the constructor.

2.5.0 warns first.

### 77. Require `spanName` whenever `otlpQueue` is set or inherited.

A child or clone of an OTLP-configured instance must name its span, and the constructor rejects one
that does not, so no backend shows `unnamed-span`.

### 78. Write `MIGRATION.md`: one entry per 3.0.0 item, with the 2.x spelling and the 3.0.0 spelling.

`entryFormatter` needs the pair case too: renaming the key beside a `format` string leaves two
`format` keys, and the last one wins.

### 57. Retry only what OTLP/HTTP calls retryable: 429, 502, 503 and 504.

Today 408, 500 and 501 retry too, and README → Queue exports documents that set, so narrowing it
waits for the major. Honouring `Retry-After` was split off as item 99, which ships in a minor.

### 70. Stop a child inheriting `spanName`.

Default to `"unnamed-span"` for both derivations.

### 71. Allow `parentLog` with `traceparent`.

Settings inherit from `parentLog`, the span nests under the upstream `traceparent`. This is the
request-handler case; today it silently loses the trace.

### 66. Attach a child's log records to its own span instead of the parent's.

OTel's rule is that a record carries the active span, and a child's `log.fetch` spans already nest
under it. No test asserts the old behaviour; write one for the new rule first.

### 53. Keep the auth scheme when an allow-listed `authorization` records `REDACTED`.

`Bearer REDACTED` and `Basic REDACTED` tell a reader chasing a 401 whether the caller sent the wrong
kind of credential, and RFC 9110's `auth-scheme` is a fixed token, never the secret. Split on the
first space and keep the prefix only where it matches the token grammar. README documents the value
as `REDACTED`, so per Goals #8 this waits for the major.

### 54. Require `msTimestamp` in `EntryFormatterConf`, and have the built-in formatters return a value for an unknown level.

Today they fall back to `Date.now()`, bypassing `clock`, and `msgTextFormatter` throws. Principle:
Functional core, imperative shell.

### 63. Rename `EntryFormatterConf` to `LogEntry`.

It is an entry, and the option it was named after is gone.

### 65. Default `colors` to `process.stdout.isTTY` when neither `NO_COLOR` nor `FORCE_COLOR` is set.

A browser, with no `process`, defaults to off. The TTY detection and its tests are in commit
9706b0a.

### 69. Export metadata as typed OTLP attribute values instead of coercing every one to `stringValue`.

Use `boolValue` for a boolean, `intValue` for a safe integer, `doubleValue` for any other number, so
OTLP carries what the JSON formatter already emits. Breaking because a backend that indexed these as
strings re-types the field, and queries and dashboards built on the string change with it.

### 52. Spell a redacted `url.full` the way OTel semconv asks: `https://REDACTED:REDACTED@host/x`.

Today the userinfo is dropped silently, so a span can carry `url.full` showing a credential-free url
beside a `status.message` quoting `http://REDACTED@host/x`, and the reader is told both that
credentials were written and that they were not. Only React Native reaches it; Node and browsers
refuse the url first. README → `log.fetch` in depth documents `url.full` as the url without its
userinfo, so per Goals #8 this waits for the major.

### 72. Make nothing throw after `end()`.

Level methods still write to the console and their OTLP records attach to the ended span, entering
the queue like any other record, so the queue's size/time flush exports them with no further call.
`end()` a second time resolves `{ err }`. Add `ended` to `LogInt`. `log.fetch` on an ended log sends
untraced, where today it throws synchronously, which the runtime's `fetch` never does.

### 58. Give the redaction sentinel its own name — `REDACTED by @larvit/log` or similar.

Today one token means three things to the telemetry reader: a header redacted by name, a value that
matched a credential shape, and a value the consumer's own app had already redacted upstream.
`REDACTED` shipped in 2.3.0 and README → Audience promises each documented span value, so renaming
it waits for the major.

### 68. Merge a child's `context` per key with the parent's, as `clone()` does.

Today a child's `context` replaces the parent's wholesale. Settle first which parent value merges: a
clone takes the live `log.context`, a child today reads `conf.context`, so they differ once
`log.context` is written to.

### 97. Keep every OTLP option, type and encoding inside the OTLP transport, so no other code knows OTLP.

The 3.0.0 half of item 96, removing what it deprecates: no part of the source outside the OTLP
transport knows or depends on anything OTLP. This takes over item 74's aim, one OTLP representation
in `conf`: today `log.conf.otlpHttpBaseURI` stays readable beside the `Queue` built from it, and
`isQueueFor` exists to match the two. Items naming `otlpQueue` or the `OtlpQueue` type, such as 17,
21, 56 and 77, are reworded to the transport shape once item 96 is approved.

### 62. Remove `entryFormatter`, the option and the `conf` alias of `format` beside it.

`format` is `"text" | "json" | ((entry) => string)`. This closes the one unsoundness 2.4.0 could
not: the alias is non-enumerable, so `ResolvedLogConf` declares a member a spread of a conf does not
carry.

### 56. Export OTLP metrics from instruments that aggregate for the caller.

The caller records measurements, and this library aggregates them and sends a metrics kind in
`OtlpPayload`, batched through `Queue` and POSTed to `/v1/metrics`. The decision "Metrics will come
with instruments that aggregate for the caller" says what aggregating covers. Collecting must never
hold a process open (Goals #9). It waits for the major because an `OtlpQueue` implementer receives
the wider union. Measure what the metrics messages and the instruments add against the 10 KB budget
before choosing which instruments ship.

### 75. Keep credentials off `log.conf` and `queue.conf`.

`otlpHttpBaseURI`'s `user:pass@` and an `otlpAdditionalHeaders` bearer token sit there verbatim, so
a consumer who logs their own conf puts them in their log store. Goals #7 stops at what this library
emits, so this is a Goals #8 break. Item 97 clears `log.conf`; `queue.conf` still needs redacting,
or its credentials held off it.

### 73. Send `traceparent` cross-origin only to urls the caller lists, or record why not.

OTel's browser fetch instrumentation defaults that way (`propagateTraceHeaderCorsUrls`), because the
header preflights a cross-origin request; today `log.fetch` sends it everywhere, so narrowing it
changes a default.

### 108. Keep two tabs of one web app sharing a `storage` key from sending a record twice or deleting each other's backlog.

Every tab builds a `Queue` on the same `localStorage` key: each loads another tab's backlog at start,
then overwrites or removes the key on every change, so offline records go twice and a tab that drains
first deletes another's backlog. README's "one `Queue` per `key` per process" is advice a web app
cannot follow. `~/.claude/principles/frontend.md` → Prefer state in the URL first, backend second.
