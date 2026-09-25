# Todo

Every item sits under the release that ships it, and a release that holds anything a consumer must
act on leads with `### Security`, the shape AGENTS.md → Working here already sets for
`CHANGELOG.md`. Per README → Goals #4, everything breaking is deprecated in a 2.x minor first and
lands in 3.0.0 with a `MIGRATION.md` entry.

Each item states the problem and what must hold once it is gone. Working out *how* is part of the
item, not settled by it: where an item names a mechanism, that is evidence of the problem, never
the prescribed repair.

## 2.4.0

`CHANGELOG.md` → `## Unreleased` holds what is done: six credential leaks closed with five
rotation advisories, the export queue, the injectable clock, `Logger`, and the `entryFormatter` and
level-string deprecations.

An architecture, product and comprehension review on 2026-09-20 found everything below in that
state. None of it is breaking.

- [ ] Make `traceparent` behave the way the option and the README both say it does — edge-only, not
  inherited by clones or children. The constructor's inheritance loop skips only
  what `otlpKeysNotToInherit` returns, so it copies the parent's `traceparent` onto the child's
  conf, while `clone()`'s separate skip set excludes it correctly: the two loops disagree. So a
  child's `log.conf.traceparent` reads back the parent's header, which README → Join an incoming
  trace says it never inherits. Whether the instance it was given should keep it on `conf` is part
  of the question.
- [ ] Make `generateTraceId` produce what three places say it produces: sixteen random bytes.
  It fixes the first one to `0x01` under the comment `// version 1 trace id`, but W3C
  Trace Context has no version field inside a trace id — the version is the header's own first
  field, which `formatTraceparent` already writes as `00`. So the comment, `generateTraceId`'s own
  "Random 16-byte trace id", and README → Exports' "Random 32- and 16-hex-char ids" are all false
  together, entropy is 120 bits rather than 128, and every trace id this library mints begins `01`.
  No test depends on it.
- [ ] Tell a `LogInt` implementer what this release costs them. 2.4.0 adds `enabled`, `flush` and
  `sampled` to the type, so a hand-written `LogInt` passed as `parentLog` stops compiling on
  upgrade — and the CHANGELOG bullet that should warn them enumerates only "conf, end, fetch, span
  and traceparent", omitting the two it added. README → Exports has it right, so the CHANGELOG is
  the false one.
- [ ] Let a consumer upgrading from 2.2.0 close the allow-listed-header and opaque-url searches in
  one sentence, the way the path-leak advisory already lets them. `log.fetch`, both allow-lists and
  `captureQuery` all shipped in v2.3.0, so those two exposures have the same floor and neither
  advisory says so. The opaque-url advisory has a second gap: it sends the reader to search for a
  `url.full` starting with `null`, but the repo's own 2026-09-19 decision records a second broken
  spelling, `https://example.comhttps://example.com/uuid`, which that search never finds.
- [ ] Export log records whatever the incoming `sampled` flag says, per AGENTS.md's 2026-09-25
  entry; only the span obeys it. `log()` returns before the enqueue whenever `sampled` is false.
  Afterwards the CHANGELOG bullet on the sampled flag, README → Join an incoming trace, the
  `traceparent` option row and the `sampled` field comment all say records still export.
- [ ] Keep `JSON.stringify(log.conf)` from throwing. With OTLP configured `log.conf.otlpQueue` is
  the `Queue` itself, and once a batch timer is pending on Node its `Timeout` makes the structure
  circular, so a debug line that worked on v2.3.0 now crashes some calls and leaks credentials on
  the rest. What a stringify carries is outside Goals #4, but a logging library crashing the app is
  not.

## 2.5.0 — close the credential story

### Security

- [ ] Keep a url nested in the request path out of `url.full`. `buildUrlFull` is `url.origin +
  url.pathname` and redacts only the query, so
  `log.fetch("https://proxy.test/fetch/https://user:pass@cb.test/x")` exports that password with no
  capture option involved — the one credential shape that reaches a span on the default path,
  against Goals' "a url it fetches … never reaches a span". A fetch-through proxy, a CORS or image
  proxy, a webhook replay endpoint and a signed-url wrapper all take that shape, and
  percent-encoding it changes nothing. `capturedValue` already holds the rule; what it does not
  settle is the cost, because a path is not a value: replacing the whole of it on a hit loses the
  endpoint the telemetry reader needs, where `/a//b@2x.png` would take the path with it, and
  splicing `REDACTED@` in the way `spanFailure` does covers the literal spelling only. Decide
  which, and record it beside the 2026-09-20 entry that settled the same question for values.
  The 2.4.0 CHANGELOG carries this as an open exposure with a rotation advisory.
- [ ] Keep a bearer token carried as a query parameter out of `url.full`. RFC 6750 §2.3 defines
  `access_token` as a way to send one, and OAuth providers still accept it, so with `captureQuery`
  on `log.fetch("https://graph.test/me?access_token=…")` exports a live token that no rule catches:
  `SENSITIVE_QUERY_KEYS` names signing-scheme parameters only, and a token has no shape. Whether
  the answer is the one RFC-defined name, the names the wild uses beside it (`api_key`, `apikey`,
  `key`, `token`), or a statement that `captureQuery` is an allow-list the caller owns and Goal 3's
  "naming it is asking for it" already covers it, is open; the 2026-09-23 decision leaves a name
  as an addition to the set. Live since 2.3.0, so a name that lands owes a rotation advisory.
- [ ] Decide what to do about Basic credentials sent over plain `http:` to a non-loopback host,
  now that they are really sent: anything on the network path can read them (CWE-319). Either warn
  once per `report` sink when the endpoint is `http:` and carries userinfo, or require `https:`
  with an opt-out, which is breaking and so wants the 2.x deprecation first. The rule matters more
  than the mechanism: a loopback-only test warns for `http://otel-collector.observability.svc.
  cluster.local:4318`, which is a deliberate and common setup, not a mistake.

### Everything else

- [ ] Move the decision log out of `AGENTS.md` into `docs/decisions.md`, leaving a one-line index
  of the titles behind, per the org-wide documentation rule. It is ~130 lines of reasoning in a
  file every session loads whole, and no entry has a title: "which entry settled header
  redaction?" is answerable only by reading four 20-line paragraphs, so give each one a bolded
  title line as part of the move. First in this release: the security items above and the redaction
  spellings below each record a decision there.
- [ ] Make `conf.format` a complete replacement for the `conf.entryFormatter` alias 3.0.0 removes.
  The alias hands back a callable `EntryFormatter`; `format` hands back `"text" | "json" |
  EntryFormatter`, and the mapping between them is `resolveFormatter`, which is not exported. So a
  library author rendering a line from a conf they were handed — the reader the deprecation warning
  sends to `conf.format` — has to re-implement it from `msgTextFormatter` and `msgJsonFormatter`,
  which no doc spells out. Exporting the resolver is additive and the obvious shape; saying it in
  the README is the other. Whichever lands has to land before 3.0.0 takes the alias away. Found by
  the 2026-09-21 product-owner review.
- [ ] Spell a redacted `url.full` the way OTel semconv asks — `https://REDACTED:REDACTED@host/x` —
  instead of dropping the userinfo silently. Today a span can carry `url.full` showing a
  credential-free url beside a `status.message` quoting `http://REDACTED@host/x`, so the reader is
  told both that credentials were written and that they were not. Only React Native reaches it;
  Node and browsers refuse the url first.
- [ ] Keep the auth scheme when an allow-listed `authorization` records `REDACTED`: `Bearer
  REDACTED` and `Basic REDACTED` tell a reader chasing a 401 whether the caller sent the wrong kind
  of credential, and RFC 9110's `auth-scheme` is a fixed token, never the secret. Split on the
  first space and keep the prefix only where it matches the token grammar.
- [ ] Report a 401 or 403 export as `OTLP export unauthorized, batch dropped`, not as the generic
  rejection. Working auth makes a wrong credential reachable for the first time, and it is the
  likeliest misconfiguration of `otlpHttpBaseURI` userinfo; today it reads as any other 4xx.
- [ ] Settle the two credential spellings: `user:pass@` in `otlpHttpBaseURI` and
  `otlpAdditionalHeaders: { Authorization }` now build the same header, which "one spelling per
  goal" says to collapse. The product-owner review argues for keeping both — a collector vendor
  hands the endpoint over as one `https://id:token@host` string, which is also the only shape a
  single env var carries — and rejecting the *combination* in the constructor instead, the way
  two different formatters already throw. That combination has never produced a working request,
  so rejecting it is safe in a minor. Either take that, or deprecate the userinfo spelling here
  and reject it in 3.0.0.
- [ ] Split the `Log` constructor into named steps — normalize options, inherit from parent, apply
  defaults, resolve the OTLP queue, open the span — ahead of the 3.0.0 item that changes three of
  them. It is ~90 lines doing five jobs with three ordering constraints held nowhere but the line
  sequence, every one of nine comprehension-panel readers named it, and four named it the unit they
  would least want to touch because it is the only one whose failure mode is silent. The split
  changes no contract, so it needs no major, and 2.5.0, 2.6.0 and 2.7.0 all edit those 90 lines
  otherwise: the `traceparent` skip-set fix and the `spanName` warning both land in them. Refactor first and 3.0.0's diff gets smaller.
- [ ] Unref the batch timer, so a pending batch never holds a Node or Deno process, per README →
  Goals #7, and drop that goal's "until 2.5.0" clause. Today only the retry timer is unref'd, so
  any pending batch holds the process for up to `batchDelayMs`, and `round()` clears the batch
  timer once, at its start, so a record logged while an export is in flight leaves one behind with
  nothing to send: measured on `node:22`, `await log.flush()` returned with both records delivered
  and the process stayed alive a further 4.7 s of a 5 s `batchDelayMs`. 2.4.0 closes the
  failed-round half. A script that awaits neither `end()` nor `flush()` then exits without
  exporting what it queued, so the CHANGELOG says so, and README → Queue exports' "A retry timer
  never keeps…" covers every timer.
- [ ] Stop a restored batch being the first thing dropped. `add(batch, true)` unshifts a failed
  batch to the front, and the `maxItems` trim then splices the excess off that same front. An
  offline phone at `maxItems` reports "OTLP export failed, will retry" for items it has already
  discarded, and the retry finds them gone — so the round trip and the promise are both spent on
  the flagship offline path. Protect a restored batch, or stop promising a retry for what was
  dropped.
- [ ] Keep a transient `storage` read failure from wiping the persisted queue. `load()` treats an
  unreadable `getItem` and corrupt content identically and then calls `removeItem`, so one flaky
  AsyncStorage read at startup loses everything a phone held offline. The full fix is larger than
  skipping the remove: after a failed load the first `save` overwrites the key anyway, so a load
  failure has to suppress saving too.
- [ ] Inject `fetch`. The queue and `log.fetch` both reach for the global, the one un-injected seam
  in a library that injects `stdout`, `stderr`, `clock`, `storage`, `report` and `otlpQueue` — and
  the suite pays for it by swapping `globalThis.fetch`, process-global state nothing can run beside.
  A React Native app that pins TLS or uses `expo/fetch` cannot route the exporter, the one request
  that crosses a hostile network, through it. Scope as `QueueConf.fetch`; whether `log.fetch` takes
  one is a separate question, since Goals says it mirrors the runtime and an injected fetch becomes
  the runtime.
- [ ] Pin every Node base image to its full patch version, so one commit builds one image on any
  day. Three places float: `ARG BASE_IMAGE=node:24-bookworm-slim` in the `Dockerfile`,
  `${NODE_IMAGE:-node:22-bookworm-slim}` in `test-docker`, and the major-only `node-version`
  matrix `push.yaml` builds its `NODE_IMAGE` from. The first two are one default written twice
  at two versions, so drop the npm script's and leave the `ARG`. Renovate already bumps a
  `Dockerfile` pin; a matrix of patch versions needs a `customManagers` rule to get the same.

## 2.6.0 — every 3.0.0 break deprecated

README → Goals #4 promises a 2.x warning before each break below, so 3.0.0 waits on this release.

- [ ] Deprecate `parentLog` together with `traceparent`. Today `traceparent` is silently ignored.
- [ ] Warn once when `colors` is unset, `process.stdout.isTTY` is false and neither `NO_COLOR` nor
  `FORCE_COLOR` is set, where 3.0.0 turns colour off.
- [ ] Warn once when `format` is a string other than `"text"` or `"json"`, which today falls back to
  text unsignalled: `new Log({ format: process.env.LOG_FORMAT })` logs text for `"pretty"`.
- [ ] Warn once when an instance with `otlpQueue` set or inherited leaves `spanName` unset, where
  3.0.0 rejects it in the constructor — the only break below that starts throwing with no warning
  planned ahead of it.
- [ ] Export `LogEntry` as an alias of `EntryFormatterConf`, so the 3.0.0 rename has a spelling a
  consumer can move to first.
- [ ] Leave a `Request` untraced in `log.fetch`. A JS consumer passing one gets `String(request)` =
  `"[object Request]"`, which in a browser resolves against `location.href` to an http(s) url:
  `log.fetch` then traces that invented url and fetches it with `init` alone, dropping the request's
  own method, body and headers. The signature says `string | URL`, so a TypeScript consumer cannot
  reach it.
- [ ] Announce in the README that 3.0.0 adds a metrics kind to `OtlpPayload`, so an `OtlpQueue`
  implementer handles one before it arrives.
- [ ] Announce in the README and CHANGELOG that 3.0.0 stops `log.conf` and `queue.conf` handing
  back a credential, so a consumer reading one out of them moves to their own copy first.
- [ ] Settle one marker for a CHANGELOG entry a consumer must act on, and record it in the
  `AGENTS.md` line beside `### Security`. Two spellings exist: the `**Breaking:**` prefix `v2.0.0`
  uses, and the `### Security` grouping. Neither covers a deprecation, so `entryFormatter` and the
  `new Log("debug")` shorthand tell a consumer their code stops working in 3.0.0 from inside
  `### Everything else`, unmarked.
- [ ] Publish the artifact the gate tested. `push.yaml` builds and tests `index.js` inside the
  container; `publish.yaml` builds a second one on the runner and publishes that, so the thing
  consumers install is never the thing CI proved. Build once, upload, publish that. Pinning the
  base images above is the other half of the same problem.
- [ ] Check the footprint budget in CI, so the numbers in the README's Goals fail a build instead
  of going stale. Bundle size is the easy half; the per-operation figures need a stable enough
  harness to not flake.

## 2.7.0 — what the telemetry reader is still missing

Each one is a weigh against README → Goals first: ship it, or delete the item and record why not.

- [ ] Resource attributes beyond `service.name`. `service.version` and `deployment.environment` are
  what the telemetry reader groups on in Grafana, and the shape is a map on the resource we already
  build.
- [ ] Span events. A reader expects to find the exception on an errored span, and the OTLP shape
  carries a dropped-count we would owe them.
- [ ] Ratio sampling. A fleet of phones on cellular has no way to cap what it sends, so the
  1000-item queue bound is a sampling decision made by accident. An incoming `traceparent` flag
  still wins where there is one.
- [ ] `tracestate`. It is invisible when unused, and the W3C rules it must hold to — 512-char
  limit, list-member ordering, the `ot` vendor key — are where the cost sits.
- [ ] Size a queued payload without materializing its JSON. `log.info` with OTLP configured costs
  6.3 µs, of which `JSON.stringify` in `withBytes` is 1.6 µs and the `utf8Length` walk over its
  result another 1.4 µs — two passes whose only job is measuring bytes for the 64 KiB `keepalive`
  cap. `TextEncoder` is not the answer: about 700 ns of fixed call overhead makes it slower than
  the walk below roughly 500 chars, and it only pays at 60 KB, where it is 6.6× faster. Measured
  on `node:24-bookworm-slim`, AMD Ryzen 9 5950X.

## 3.0.0 — breaking

- [ ] OTLP metrics as a stateless pass-through: a metrics kind in `OtlpPayload`, batched through
  `Queue` and POSTed to `/v1/metrics`, with the types carrying what a valid point must have. It
  waits for the major because an `OtlpQueue` implementer receives the wider union. Measure what
  the metrics messages add to the protobuf encoder against the 10 KB budget before deciding.

- [ ] Give the redaction sentinel its own name — `REDACTED by @larvit/log` or similar. Today one
  token means three things to the telemetry reader: a header redacted by name, a value that matched
  a credential shape, and a value the consumer's own app had already redacted upstream. `REDACTED`
  shipped in 2.3.0 and Goals #4 promises each documented span value, so renaming it waits for the
  major.
- [ ] Remove the level-string shorthand from `Log` and `clone`.
- [ ] Remove `entryFormatter`, the option and the `conf` alias of `format` beside it; `format` is
  `"text" | "json" | ((entry) => string)`. This closes the one unsoundness 2.4.0 could not: the
  alias is non-enumerable, so `ResolvedLogConf` declares a member a spread of a conf does not
  carry.
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
  Today `log.conf.otlpHttpBaseURI` stays readable, which is why this waits for a major. It lands on
  the constructor 2.5.0 already split.
- [ ] Keep credentials off `log.conf` and `queue.conf`. `otlpHttpBaseURI`'s `user:pass@` and an
  `otlpAdditionalHeaders` bearer token sit there verbatim, so a consumer who logs their own conf puts
  them in their log store. Goals #3 stops at what this library emits, so this is a Goals #4 break. The `otlpQueue`
  item above clears `log.conf`; `queue.conf` still needs redacting, or its credentials held off it.
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
