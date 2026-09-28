# Todo

Each item opens with a bold one-sentence tagline of what must hold once its problem is gone, then
states the problem. Working out *how* is part of the item, not settled by it: where an item names a
mechanism, that is evidence of the problem, never the prescribed repair.

## 2.4.0

- [ ] **Export log records whatever the incoming `sampled` flag says; only the span obeys it.** Per
  `docs/decisions.md`'s 2026-09-25 entry. `log()` returns before the enqueue whenever `sampled` is
  false.
  Afterwards the CHANGELOG bullet on the sampled flag, README → Join an incoming trace, the
  `traceparent` option row and the `sampled` field comment all say records still export.
- [ ] **Restore `"fetch_error"` as a `log.fetch` span's `error.type` fallback.** v2.3.0's README
  documented it, so Goals #4 holds it; `_OTHER` waits for 3.0.0 behind a 2.6.0 deprecation.
  Unreleased swaps it in a minor.
- [ ] **Keep an injected `clock` from hanging `flush()` and `end()`.** `tracedFetch` calls
  `childSpan` before its `try`, on the comment that it cannot throw, but `getNsTimestamp` hands
  `BigInt` a fraction whenever `now()` returns one — a `performance.now()`-based clock does — and a
  caller's `now()` may throw outright; either way the tracked promise never settles. A `setTimeout`
  that throws rejects the round, and the `pending` flush chained on it keeps that rejection, since
  `this.pending = undefined` sits in the skipped `.then`: every later mid-round `flush()` returns it
  and queues no round. `clock` is new in 2.4.0.
- [ ] **Keep `JSON.stringify(log.conf)` from throwing.** With OTLP configured `log.conf.otlpQueue`
  is the `Queue` itself, and once a batch timer is pending on Node its `Timeout` makes the structure
  circular, so a debug line that worked on v2.3.0 now crashes some calls and leaks credentials on
  the rest. What a stringify carries is outside Goals #4, but a logging library crashing the app is
  not.

## 2.5.0 — close the credential story

### Security

- [ ] **Keep a parent's `otlpAdditionalHeaders` off a child or clone that names its own
  `otlpHttpBaseURI`.** It inherits the headers, so `new Log({ parentLog, otlpHttpBaseURI: other })`
  sends the parent's bearer token to `other`, a host it was never issued for. Shipped in v2.3.0.

- [ ] **Keep a url nested in the request path out of `url.full`.** `buildUrlFull` is `url.origin +
  url.pathname` and redacts only the query, so
  `log.fetch("https://proxy.test/fetch/https://user:pass@cb.test/x")` exports that password with no
  capture option involved — the one credential shape that reaches a span on the default path,
  against Goals' "a url it fetches … never reaches a span". A fetch-through proxy, a CORS or image
  proxy, a webhook replay endpoint and a signed-url wrapper all take that shape, and
  percent-encoding it changes nothing. `redactCredential` already holds the rule; what it does not
  settle is the cost, because a path is not a value: replacing the whole of it on a hit loses the
  endpoint the telemetry reader needs, where `/a//b@2x.png` would take the path with it, and
  splicing `REDACTED@` in the way `spanFailure` does covers the literal spelling only. Decide which,
  and record it beside the 2026-09-20 entry that settled the same question for values. The 2.4.0
  CHANGELOG carries this as an open exposure with a rotation advisory.
- [ ] **Keep a bearer token carried as a query parameter out of `url.full`.** RFC 6750 §2.3 defines
  `access_token` as a way to send one, and OAuth providers still accept it, so with `captureQuery`
  on `log.fetch("https://graph.test/me?access_token=…")` exports a live token that no rule catches:
  `SENSITIVE_QUERY_KEYS` names signing-scheme parameters only, and a token has no shape. Whether the
  answer is the one RFC-defined name, the names the wild uses beside it (`api_key`, `apikey`, `key`,
  `token`), or a statement that `captureQuery` is an allow-list the caller owns and Goal 3's "naming
  it is asking for it" already covers it, is open; the 2026-09-23 decision leaves a name as an
  addition to the set. Live since 2.3.0, so a name that lands owes a rotation advisory.
- [ ] **Signal or refuse Basic credentials sent over plain `http:` to a non-loopback host.** Now
  that they are really sent, anything on the network path can read them (CWE-319). Either warn once
  per `report` sink when the endpoint is `http:` and carries userinfo, or require `https:` with an
  opt-out, which is breaking and so wants the 2.x deprecation first. The rule matters more than the
  mechanism: a loopback-only test warns for
  `http://otel-collector.observability.svc.cluster.local:4318`, which is a deliberate and common
  setup, not a mistake.

### Everything else

- [ ] **Make `conf.format` a complete replacement for the `conf.entryFormatter` alias 3.0.0
  removes.** The alias hands back a callable `EntryFormatter`; 3.0.0's `format` hands back `"text" |
  "json" | EntryFormatter`, and the mapping between them is `formatterOf`, which is not exported. So
  a library author rendering a line from a conf they were handed has to re-implement it from
  `msgTextFormatter` and `msgJsonFormatter`, which no doc spells out. Exporting the resolver is
  additive and the obvious shape; saying it in the README is the other. Whichever lands has to land
  before 3.0.0 takes the alias away. Found by the 2026-09-21 product-owner review.
- [ ] **Spell a redacted `url.full` the way OTel semconv asks: `https://REDACTED:REDACTED@host/x`.**
  Today the userinfo is dropped silently, so a span can carry `url.full` showing a credential-free
  url beside a `status.message` quoting `http://REDACTED@host/x`, and the reader is told both that
  credentials were written and that they were not. Only React Native reaches it; Node and browsers
  refuse the url first.
- [ ] **Keep the auth scheme when an allow-listed `authorization` records `REDACTED`.** `Bearer
  REDACTED` and `Basic REDACTED` tell a reader chasing a 401 whether the caller sent the wrong kind
  of credential, and RFC 9110's `auth-scheme` is a fixed token, never the secret. Split on the first
  space and keep the prefix only where it matches the token grammar.
- [ ] **Report a 401 or 403 export as `OTLP export unauthorized, batch dropped`.** Working auth
  makes a wrong credential reachable for the first time, and it is the likeliest misconfiguration of
  `otlpHttpBaseURI` userinfo; today it reads as any other 4xx.
- [ ] **Settle the two credential spellings, `user:pass@` in `otlpHttpBaseURI` and
  `otlpAdditionalHeaders: { Authorization }`.** They now build the same header, which "one spelling
  per goal" says to collapse. The product-owner review argues for keeping both — a collector vendor
  hands the endpoint over as one `https://id:token@host` string, which is also the only shape a
  single env var carries — and rejecting the *combination* in the constructor instead, the way two
  different formatters already throw. That combination has never produced a working request, so
  rejecting it is safe in a minor. Either take that, or deprecate the userinfo spelling here and
  reject it in 3.0.0.
- [ ] **Unref the batch timer, so a pending batch never holds a Node or Deno process.** README →
  Goals #7 asks for it; drop that goal's "until 2.5.0" clause. Today only the retry timer is
  unref'd, so any pending batch holds the process for up to `batchDelayMs`, and `round()` clears the
  batch timer once, at its start, so a record logged while an export is in flight leaves one behind
  with nothing to send: measured on `node:22`, `await log.flush()` returned with both records
  delivered and the process stayed alive a further 4.7 s of a 5 s `batchDelayMs`. 2.4.0 closes the
  failed-round half. A script that awaits neither `end()` nor `flush()` then exits without exporting
  what it queued, so the CHANGELOG says so, and README → Queue exports' "A retry timer never keeps…"
  covers every timer.
- [ ] **Stop a restored batch being the first thing dropped.** `prepend(batch)` unshifts a failed
  batch to the front, and the `maxItems` trim then splices the excess off that same front. An
  offline phone at `maxItems` reports "OTLP export failed, will retry" for items it has already
  discarded, and the retry finds them gone — so the round trip and the promise are both spent on the
  flagship offline path. Protect a restored batch, or stop promising a retry for what was dropped.
- [ ] **Keep a batch in the persisted queue until its send settles.** `takeBatch` removes it from
  `items` before `send`, so a record logged during the send saves the queue without it, and a
  process that dies then loses the batch its storage exists to keep.
- [ ] **Name the instrumentation scope after this library.** Today `scope.name` is the span name,
  and batch merging splits `scopeSpans` by it, where OTel's scope identifies the instrumenting code.
  The README documents neither, so it ships in a minor.
- [ ] **Keep a transient `storage` read failure from wiping the persisted queue.** `load()` treats
  an unreadable `getItem` and corrupt content identically and then calls `removeItem`, so one flaky
  AsyncStorage read at startup loses everything a phone held offline. The full fix is larger than
  skipping the remove: after a failed load the first `save` overwrites the key anyway, so a load
  failure has to suppress saving too.
- [ ] **Let a consumer inject the `fetch` the OTLP queue sends with.** The queue and `log.fetch`
  both reach for the global, the one un-injected seam in a library that injects `stdout`, `stderr`,
  `clock`, `storage`, `report` and `otlpQueue` — and the suite pays for it by swapping
  `globalThis.fetch`, process-global state nothing can run beside. A React Native app that pins TLS
  or uses `expo/fetch` cannot route the exporter, the one request that crosses a hostile network,
  through it. Scope as `QueueConf.fetch`; whether `log.fetch` takes one is a separate question,
  since Goals says it mirrors the runtime and an injected fetch becomes the runtime.
- [ ] **Pin every Node base image to its full patch version, so one commit builds one image on any
  day.** Three places float: `ARG BASE_IMAGE=node:24-bookworm-slim` in the `Dockerfile`,
  `${NODE_IMAGE:-node:22-bookworm-slim}` in `test-docker`, and the major-only `node-version` matrix
  `push.yaml` builds its `NODE_IMAGE` from. The first two are one default written twice at two
  versions, so drop the npm script's and leave the `ARG`. Renovate already bumps a `Dockerfile` pin;
  a matrix of patch versions needs a `customManagers` rule to get the same.

## 2.6.0 — every 3.0.0 break deprecated

README → Goals #4 promises a 2.x warning before each break below, so 3.0.0 waits on this release.

- [ ] **Deprecate `parentLog` together with `traceparent`.** Today `traceparent` is silently
  ignored.
- [ ] **Warn once when `colors` is unset, `process.stdout.isTTY` is false and neither `NO_COLOR` nor
  `FORCE_COLOR` is set, where 3.0.0 turns colour off.**
- [ ] **Warn once when `format` is a string other than `"text"` or `"json"`.** Today it falls back
  to text unsignalled: `new Log({ format: process.env.LOG_FORMAT })` logs text for `"pretty"`.
- [ ] **Warn once when an instance with `otlpQueue` set or inherited leaves `spanName` unset.**
  3.0.0 rejects it in the constructor — the only break below that starts throwing with no warning
  planned ahead of it.
- [ ] **Export `LogEntry` as an alias of `EntryFormatterConf`, so the 3.0.0 rename has a spelling a
  consumer can move to first.**
- [ ] **Leave a `Request` untraced in `log.fetch`.** A JS consumer passing one gets
  `String(request)` = `"[object Request]"`, which in a browser resolves against `location.href` to
  an http(s) url: `log.fetch` then traces that invented url and fetches it with `init` alone,
  dropping the request's own method, body and headers. The signature says `string | URL`, so a
  TypeScript consumer cannot reach it.
- [ ] **Announce in the README that 3.0.0 adds a metrics kind to `OtlpPayload`, so an `OtlpQueue`
  implementer handles one before it arrives.**
- [ ] **Announce in the README and CHANGELOG that 3.0.0 stops `log.conf` and `queue.conf` handing
  back a credential, so a consumer reading one out of them moves to their own copy first.**
- [ ] **Settle one marker for a CHANGELOG entry a consumer must act on, and record it in the
  `AGENTS.md` line beside `### Security`.** Two spellings exist: the `**Breaking:**` prefix `v2.0.0`
  uses, and the `### Security` grouping. Neither covers a deprecation, so `entryFormatter` and the
  `new Log("debug")` shorthand tell a consumer their code stops working in 3.0.0 from inside `###
  Everything else`, unmarked.
- [ ] **Publish the artifact the gate tested.** `push.yaml` builds and tests `index.js` inside the
  container; `publish.yaml` builds a second one on the runner and publishes that, so the thing
  consumers install is never the thing CI proved. Build once, upload, publish that. Pinning the base
  images above is the other half of the same problem.
- [ ] **Check the footprint budget in CI, so the numbers in the README's Goals fail a build instead
  of going stale.** Bundle size is the easy half; the per-operation figures need a stable enough
  harness to not flake.

## 2.7.0 — what the telemetry reader is still missing

Each one is a weigh against README → Goals first: ship it, or delete the item and record why not.

- [ ] **Name a `log.fetch` span and its errors as HTTP semconv does.** That is `{method}` alone
  without a url template, where today it is `{method} {host}`; an unknown method as `_OTHER` with
  `http.request.method_original`; and `error.type` set to the status code on a 4xx or 5xx.
- [ ] **Export resource attributes beyond `service.name`.** `service.version` and
  `deployment.environment` are what the telemetry reader groups on in Grafana, and the shape is a
  map on the resource we already build.
- [ ] **Export span events.** A reader expects to find the exception on an errored span, and the
  OTLP shape carries a dropped-count we would owe them.
- [ ] **Let a consumer sample by ratio.** A fleet of phones on cellular has no way to cap what it
  sends, so the 1000-item queue bound is a sampling decision made by accident. An incoming
  `traceparent` flag still wins where there is one.
- [ ] **Propagate `tracestate`.** It is invisible when unused, and the W3C rules it must hold to —
  512-char limit, list-member ordering, the `ot` vendor key — are where the cost sits.
- [ ] **Size a queued payload without materializing its JSON.** `log.info` with OTLP configured
  costs 6.3 µs, of which `JSON.stringify` in `withBytes` is 1.6 µs and the `utf8Length` walk over
  its result another 1.4 µs — two passes whose only job is measuring bytes for the 64 KiB
  `keepalive` cap. `TextEncoder` is not the answer: about 700 ns of fixed call overhead makes it
  slower than the walk below roughly 500 chars, and it only pays at 60 KB, where it is 6.6× faster.
  Measured on `node:24-bookworm-slim`, AMD Ryzen 9 5950X.

## 3.0.0 — breaking

- [ ] **Export OTLP metrics as a stateless pass-through.** That is a metrics kind in `OtlpPayload`,
  batched through `Queue` and POSTed to `/v1/metrics`, with the types carrying what a valid point
  must have. It waits for the major because an `OtlpQueue` implementer receives the wider union.
  Measure what the metrics messages add to the protobuf encoder against the 10 KB budget before
  deciding.

- [ ] **Retry only what OTLP/HTTP calls retryable — 429, 502, 503 and 504 — and honour
  `Retry-After`.** Today 408, 500 and 501 retry too, and README → Queue exports documents that set,
  so narrowing it waits for the major; honouring `Retry-After` alone may ship earlier.

- [ ] **Give the redaction sentinel its own name — `REDACTED by @larvit/log` or similar.** Today one
  token means three things to the telemetry reader: a header redacted by name, a value that matched
  a credential shape, and a value the consumer's own app had already redacted upstream. `REDACTED`
  shipped in 2.3.0 and Goals #4 promises each documented span value, so renaming it waits for the
  major.
- [ ] **Make `LogInt` `Logger` plus its own members, `enabled`, `flush` and `sampled` required.**
- [ ] **Remove the level-string shorthand from `Log` and `clone`.**
- [ ] **Remove `entryFormatter`, the option and the `conf` alias of `format` beside it.** `format`
  is `"text" | "json" | ((entry) => string)`. This closes the one unsoundness 2.4.0 could not: the
  alias is non-enumerable, so `ResolvedLogConf` declares a member a spread of a conf does not carry.
- [ ] **Rename `EntryFormatterConf` to `LogEntry`.** It is an entry, and the option it was named
  after is gone.
- [ ] **Reject a `format` string other than `"text"` or `"json"` in the constructor.**
- [ ] **Default `colors` to `process.stdout.isTTY` when neither `NO_COLOR` nor `FORCE_COLOR` is
  set.** The TTY detection and its tests are in commit 9706b0a.
- [ ] **Attach a child's log records to its own span instead of the parent's.** OTel's rule is that
  a record carries the active span, and a child's `log.fetch` spans already nest under it. No test
  asserts the old behaviour; write one for the new rule first.
- [ ] **Let per-call metadata win over `context` on a key collision.** The more specific value wins;
  today `context` wins.
- [ ] **Merge a child's `context` per key with the parent's, as `clone()` does.** Today a child's
  `context` replaces the parent's wholesale. Settle first which parent value merges: a clone takes
  the live `log.context`, a child today reads `conf.context`, so they differ once `log.context` is
  written to.
- [ ] **Export metadata as typed OTLP attribute values instead of coercing every one to
  `stringValue`.** Use `boolValue` for a boolean, `intValue` for a safe integer, `doubleValue` for
  any other number, so OTLP carries what the JSON formatter already emits. Breaking because a
  backend that indexed these as strings re-types the field, and queries and dashboards built on the
  string change with it.
- [ ] **Stop a child inheriting `spanName`.** Default to `"unnamed-span"` for both derivations.
- [ ] **Allow `parentLog` with `traceparent`.** Settings inherit from `parentLog`, the span nests
  under the upstream `traceparent`. This is the request-handler case; today it silently loses the
  trace.
- [ ] **Make nothing throw after `end()`.** Level methods still write to the console and their OTLP
  records attach to the ended span, entering the queue like any other record, so the queue's
  size/time flush exports them with no further call. `end()` a second time resolves `{ err }`. Add
  `ended` to `LogInt`.
- [ ] **Keep `otlpQueue` as the only OTLP representation in `conf`.** Build the default `Queue` from
  the three `otlp*` shorthands and clear them, so inheritance needs one rule and `isQueueFor` goes.
  Today `log.conf.otlpHttpBaseURI` stays readable, which is why this waits for a major.
- [ ] **Keep credentials off `log.conf` and `queue.conf`.** `otlpHttpBaseURI`'s `user:pass@` and an
  `otlpAdditionalHeaders` bearer token sit there verbatim, so a consumer who logs their own conf
  puts them in their log store. Goals #3 stops at what this library emits, so this is a Goals #4
  break. The `otlpQueue` item above clears `log.conf`; `queue.conf` still needs redacting, or its
  credentials held off it.
- [ ] **Require `spanName` whenever `otlpQueue` is set or inherited.** A child or clone of an
  OTLP-configured instance must name its span, and the constructor rejects one that does not, so no
  backend shows `unnamed-span`.
- [ ] **Write `MIGRATION.md`: one entry per item above, with the 2.x spelling and the 3.0.0
  spelling.** `entryFormatter` needs the pair case too: renaming the key beside a `format` string
  leaves two `format` keys, and the last one wins.

## Kept as is, decided 2026-09-16

- **Keep `new TextEncoder()` in `ProtoWriter.string` without a fallback.** Decided 2026-09-17:
  Hermes has had the global since React Native 0.74 (Expo SDK 51 changelog, 2024-05-07), and every
  supported React Native is newer.
- **Keep the protobuf encoder.** Collectors that reject JSON are real, and the whole file is 4.7 KB
  gz.
