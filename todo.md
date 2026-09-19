# Todo

Plan for 3.0.0. Per AGENTS.md → Audience, everything breaking is deprecated in a 2.x minor
first and lands in 3.0.0 with a `MIGRATION.md` entry. Additive work ships in 2.x as it is done.

## Security

- [ ] Keep a header named in `captureRequestHeaders` from exporting a credential: a consumer who
  lists `authorization` puts the raw token on every client span, against Goals' "nothing you put
  in a url, a header or a conf reaches a span". `captureQuery` already takes the other stance —
  opt in to capture, and `SENSITIVE_QUERY_KEYS` still redacts the value — so the two allow-lists
  disagree. Decide whether a known-sensitive header name (`authorization`, `proxy-authorization`,
  `cookie`, `set-cookie`) records `REDACTED` like a query key does, or is rejected outright.
- [ ] Decide what to do about Basic credentials sent over plain `http:` to a non-loopback host,
  now that they are really sent: anything on the network path can read them (CWE-319). Either warn
  once per `report` sink when the endpoint is `http:` and carries userinfo, or require `https:`
  with an opt-out, which is breaking and so wants the 2.x deprecation first. The rule matters more
  than the mechanism: a loopback-only test warns for `http://otel-collector.observability.svc.
  cluster.local:4318`, which is a deliberate and common setup, not a mistake.
- [ ] Keep `otlpHttpBaseURI` credentials off `log.conf` and `queue.conf`, which the README
  documents as public: the URI sits there verbatim, so a consumer who logs their own conf — as
  the README's own library example spells `JSON.stringify(options.settings)` — puts the password
  in their log store. No library path emits it. `isQueueFor` compares that exact string, so
  stripping it means carrying the endpoint through child and clone inheritance another way;
  the 3.0.0 `otlpQueue`-only item below already moves that ground.
- [x] Send `username:password@` from `otlpHttpBaseURI` as an `Authorization: Basic` header instead
  of leaving it in the url: basic-auth credentials a consumer puts there reached `stderr` in the
  metadata of every export-failure line, through the default `console.error` sink as readily as
  through a configured one, and `fetch` refused the url outright on Node and in browsers.

## 2.x minors, before 3.0.0

### Additive

- [x] Add a `Logger` type: the six level methods plus `enabled(level)`, so a library can skip
  building expensive metadata. Redefine `LogInt = Logger & { conf, end, fetch, span,
  traceparent }`; `flush` joins it with the export queue. Libraries accept `Logger`; `parentLog`
  stays `LogInt`.
- [x] Accept `undefined` in `MetadataValue` and drop such keys on output, so `{ port: options.port }`
  with an optional field type-checks.
- [x] Add `end({ error })`, which marks the instance's span failed: status `ERROR`, `error.type`
  from the error's `code`, else `name`, and the message as the status message. Keep `log.error()`
  from marking the span; a logged and recovered error is not a failed operation.
- [x] Add an export queue, pluggable through an `otlpQueue` option: `OtlpQueue` is
  `enqueue(payload)` + `flush()`; `Queue` is the one implementation, in memory or, with
  `storage`, persisted across app restarts. Batching by size and time, retry with backoff,
  `keepalive` and the 64 KB cap, the 1000-item bound and one stderr line per failed attempt all live
  in the queue. `log.flush()` flushes without ending; `end()` flushes after closing the span.
- [x] Add `colors?: boolean` to the text format, defaulting to on.
- [x] Treat any 2xx as JSON export success and warn on a non-zero `partialSuccess` rejected
  count.
- [x] Reject `traceparent` version `ff` and honour the incoming `sampled` flag: unsampled means no
  export and an outgoing header saying `00`. `tracestate` stays out of scope.
- [x] Copy the caller's options object in the constructor instead of filling defaults into it.
- [x] Inject one clock (`now`, `setTimeout`, `clearTimeout`) behind span and record timestamps and
  the `Queue` timers, so tests assert exact times instead of "within an hour" and the retry
  schedule, its 30 s cap included, without waiting.
- [ ] Leave a `Request` untraced in `log.fetch`. A JS consumer passing one gets `String(request)` =
  `"[object Request]"`, which in a browser resolves against `location.href` to an http(s) url:
  `log.fetch` then traces that invented url and fetches it with `init` alone, dropping the request's
  own method, body and headers. The signature says `string | URL`, so a TypeScript consumer cannot
  reach it.
- [ ] Weigh ratio sampling against the Goals test and either ship it or record why not. A fleet of
  phones on cellular has no way to cap what it sends, so the 1000-item queue bound is a sampling
  decision made by accident. An incoming `traceparent` flag still wins where there is one.
- [ ] Weigh resource attributes beyond `service.name` the same way. `service.version` and
  `deployment.environment` are what the telemetry reader groups on in Grafana, and the shape is a
  map on the resource we already build.
- [ ] Weigh span events the same way. A reader expects to find the exception on an errored span,
  and the OTLP shape carries a dropped-count we would owe them.
- [ ] Weigh `tracestate` the same way. It is invisible when unused, and the W3C rules it must hold
  to — 512-char limit, list-member ordering, the `ot` vendor key — are where the cost sits.
- [ ] Weigh OTLP metrics as a stateless pass-through: encode an already-aggregated point, batch it
  through `Queue` and POST it to `/v1/metrics`, with the types carrying what a valid point must
  have. Measure what the metrics messages add to the protobuf encoder against the 10 KB budget
  before deciding.
- [ ] Check the footprint budget in CI, so the numbers in the README's Goals fail a build instead
  of going stale. Bundle size is the easy half; the per-operation figures need a stable enough
  harness to not flake.
- [ ] Size a queued payload without materializing its JSON. `log.info` with OTLP configured costs
  6.3 µs, of which `JSON.stringify` in `withBytes` is 1.6 µs and the `utf8Length` walk over its
  result another 1.4 µs — two passes whose only job is measuring bytes for the 64 KiB `keepalive`
  cap. `TextEncoder` is not the answer: about 700 ns of fixed call overhead makes it slower than
  the walk below roughly 500 chars, and it only pays at 60 KB, where it is 6.6× faster. Measured
  on `node:24-bookworm-slim`, AMD Ryzen 9 5950X.
- [ ] Report a 401 or 403 export as `OTLP export unauthorized, batch dropped`, not as the generic
  rejection. Working auth makes a wrong credential reachable for the first time, and it is the
  likeliest misconfiguration of `otlpHttpBaseURI` userinfo; today it reads as any other 4xx.
- [ ] Pin every Node base image to its full patch version, so one commit builds one image on any
  day. Three places float: `ARG BASE_IMAGE=node:24-bookworm-slim` in the `Dockerfile`,
  `${NODE_IMAGE:-node:22-bookworm-slim}` in `test-docker`, and the major-only `node-version`
  matrix `push.yaml` builds its `NODE_IMAGE` from. The first two are one default written twice
  at two versions, so drop the npm script's and leave the `ARG`. Renovate already bumps a
  `Dockerfile` pin; a matrix of patch versions needs a `customManagers` rule to get the same.
- [x] Add a size badge to the README (2.3.0: 15.0 KB minified, 4.7 KB gzipped).
- [x] Rename `.github/workflows/master.yaml` to `push.yaml` and update the README badge.

### Deprecations (warn once on stderr)

- [ ] Settle the two credential spellings: `user:pass@` in `otlpHttpBaseURI` and
  `otlpAdditionalHeaders: { Authorization }` now build the same header, which "one spelling per
  goal" says to collapse. The product-owner review argues for keeping both — a collector vendor
  hands the endpoint over as one `https://id:token@host` string, which is also the only shape a
  single env var carries — and rejecting the *combination* in the constructor instead, the way
  two different formatters already throw. That combination has never produced a working request,
  so rejecting it is safe in a minor. Either take that, or deprecate the userinfo spelling here
  and reject it in 3.0.0.
- [x] Deprecate `new Log("level")` and `clone("level")` in favour of `{ logLevel }`.
- [x] Deprecate `entryFormatter` in favour of `format`, and make `format` also accept
  `(entry) => string`.
- [ ] Deprecate `parentLog` together with `traceparent`. Today `traceparent` is silently ignored.
- [ ] Warn once when `colors` is unset, `process.stdout.isTTY` is false and neither `NO_COLOR` nor
  `FORCE_COLOR` is set, where 3.0.0 turns colour off.
- [ ] Warn once when `format` is a string other than `"text"` or `"json"`, which today falls back to
  text unsignalled: `new Log({ format: process.env.LOG_FORMAT })` logs text for `"pretty"`.

## 3.0.0, breaking

- [ ] Remove the level-string shorthand from `Log` and `clone`.
- [ ] Remove `entryFormatter`; `format` is `"text" | "json" | ((entry) => string)`.
- [ ] Rename `EntryFormatterConf` to `LogEntry`: it is an entry, and the option it was named after
  is gone.
- [ ] Reject a `format` string other than `"text"` or `"json"` in the constructor.
- [ ] Default `colors` to `process.stdout.isTTY` when neither `NO_COLOR` nor `FORCE_COLOR` is set.
  The TTY detection and its tests are in commit 9706b0a.
- [ ] Attach a child's log records to its own span instead of the parent's. OTel's rule is that a
  record carries the active span, and a child's `log.fetch` spans already nest under it. No test
  asserts the old behaviour; write one for the new rule first.
- [ ] Let per-call metadata win over `context` on a key collision; the more specific value wins.
  Today `context` wins.
- [ ] Merge a child's `context` per key with the parent's, as `clone()` does. Today a child's
  `context` replaces the parent's wholesale.
- [ ] Export metadata as typed OTLP attribute values instead of coercing every one to
  `stringValue`: `boolValue` for a boolean, `intValue` for a safe integer, `doubleValue` for any
  other number, so OTLP carries what the JSON formatter already emits. Breaking because a backend
  that indexed these as strings re-types the field, and queries and dashboards built on the string
  change with it.
- [ ] Stop a child inheriting `spanName`; default to `"unnamed-span"` for both derivations.
- [ ] Allow `parentLog` with `traceparent`: settings inherit from `parentLog`, the span nests under
  the upstream `traceparent`. This is the request-handler case; today it silently loses the trace.
- [ ] Make nothing throw after `end()`. Level methods still write to the console and their OTLP
  records attach to the ended span, entering the queue like any other record, so the queue's
  size/time flush exports them with no further call. `end()` a second time resolves `{ err }`.
  Add `ended` to `LogInt`.
- [ ] Keep `otlpQueue` as the only OTLP representation in `conf`: build the default `Queue` from
  the three `otlp*` shorthands and clear them, so inheritance needs one rule and `isQueueFor` goes.
  Today `log.conf.otlpHttpBaseURI` stays readable, which is why this waits for a major. Split the
  constructor into named steps in the same change; it is ~90 lines doing five jobs and this touches
  three of them.
- [ ] Require `spanName` whenever `otlpQueue` is set or inherited: a child or clone of an
  OTLP-configured instance must name its span, and the constructor rejects one that does not, so
  no backend shows `unnamed-span`.
- [ ] Write `MIGRATION.md`: one entry per item above, with the 2.x spelling and the 3.0.0 spelling.
  `entryFormatter` needs the pair case too: renaming the key beside a `format` string leaves two
  `format` keys, and the last one wins.

## Kept as is, decided 2026-09-16

- `new TextEncoder()` in `ProtoWriter.string` stays without a fallback (decided 2026-09-17): Hermes
  has had the global since React Native 0.74 (Expo SDK 51 changelog, 2024-05-07), and every
  supported React Native is newer.
- Protobuf encoder stays; collectors that reject JSON are real, and the whole file is 4.7 KB gz.
