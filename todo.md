# Todo

Every item sits under the release that ships it, and a release that holds anything a consumer must
act on leads with `### Security`, the shape AGENTS.md → Working here already sets for
`CHANGELOG.md`. Per README → Audience, everything breaking is deprecated in a 2.x minor first and
lands in 3.0.0 with a `MIGRATION.md` entry.

## 2.4.0

`CHANGELOG.md` → `## Unreleased` holds what is done: five credential leaks closed with four
rotation advisories, the export queue, the injectable clock, `Logger`, and the `entryFormatter` and
level-string deprecations. A 2026-09-20 architecture, product and comprehension review found the
items below in that state; each is non-breaking, and each is either a live exposure, a crash, or a
claim the repo makes and does not keep.

### Security

- [ ] Redact the SigV4 presigned-url query keys: `x-amz-signature`, `x-amz-credential`,
  `x-amz-security-token` and `x-goog-credential`. `SENSITIVE_QUERY_KEYS` (`index.ts:1159`) mirrors
  OTel semconv's default deny-list, which is the SigV2/Azure-era one — so with `captureQuery` on, a
  presigned S3 url exports its signature in full, its access key id inside `X-Amz-Credential`, and a
  live session token inside `X-Amz-Security-Token`. Every AWS presigned url written since 2014 takes
  that shape. Semconv's list is a default, not a maximum, so redacting more breaks no spec and the
  2026-09-20 decision already licenses over-redaction in a minor. Live since 2.3.0, where
  `captureQuery` and `url.full` shipped, so it needs a rotation advisory of its own.
- [ ] Give the path-nested-url advisory a search that finds the likeliest shape. `CHANGELOG.md`
  tells the reader to search `url.full` for `@`, `%40` and `%2540`; a nested url is normally
  percent-encoded and normally signed, so its credential is a query parameter of the inner url and
  **none of those three appear anywhere in it**. A consumer runs exactly the advised search, comes
  back clean and concludes they are safe. Add the second-`://`-or-`%3A%2F%2F`-after-the-origin
  search and name the parameter shapes.
- [ ] Put the `conf` credential exposure in the release's `### Security` section, and widen it to
  `otlpAdditionalHeaders`. 2.4.0 makes it worse in two ways the section does not mention:
  `queue.conf` becomes a second public holder of the same string, and `user:pass@` starts actually
  working, so more consumers will set it. The README warns "don't log your `conf`" in the
  `otlpHttpBaseURI` row only — the `otlpAdditionalHeaders` row, the spelling the docs steer people
  to for a token, carries no warning at all. Per AGENTS.md → Working here, a release with an
  exposure still open leads with `### Security` holding it.

### Everything else

- [ ] Stop an unknown `logLevel` crashing every level method. `enabled()` (`index.ts:1543`) reads
  `LogLevels[this.conf.logLevel].severityNumber`, and `log()` gates on `enabled()`, so
  `new Log({ logLevel: "trace" })` throws `TypeError: Cannot read properties of undefined` on
  `log.info()` and on all five others. TypeScript rejects the literal; the README's own examples are
  JavaScript, where nothing does, and `LOG_LEVEL=trace` (pino) or `http` (winston) is the obvious
  input. 2.4.0 is also the release that adds `enabled()` as the guard README → Accept a logger in
  your library tells library authors to call, so a library crashes inside its consumer's app. Fall
  back to `"info"` and warn once through the existing sink, as `msgTextFormatter` already does for
  the same class of input.
- [ ] Keep `traceparent` out of a child's `conf`. The constructor's inheritance loop
  (`index.ts:1287`) skips only what `otlpKeysNotToInherit` returns, so it copies the parent's
  `traceparent` — against the option's own comment ("Edge-only: not inherited by clones/children")
  and README → Options. `clone()`'s separate skip set excludes it correctly, so the two loops
  disagree. The child's own span is right; a spread of that conf, a spelling this release
  advertises, has no `parentLog` and adopts the stale header, parenting a span to a dead upstream
  span. Add it to the skip set, and settle whether the instance it was given keeps it on `conf`.
- [ ] Drop `bytes[0] = 0x01` from `generateTraceId` (`index.ts:308`). W3C Trace Context has no
  version field inside a trace id — the version is the header's own first field, which
  `formatTraceparent` already writes as `00`. The line makes three things false at once: its own
  `// version 1 trace id`, `generateTraceId`'s "Random 16-byte trace id", and README → Exports'
  "Random 32- and 16-hex-char ids". It also spends 8 bits of entropy and makes every trace id this
  library mints start `01`. No test depends on it.
- [ ] Correct the `LogInt` enumeration in the CHANGELOG: it omits `flush` and `sampled`, which
  2.4.0 adds alongside `enabled`. README → Exports has it right, so the CHANGELOG is the false one.
  Say what it costs — a hand-written `LogInt` passed as `parentLog` stops compiling on upgrade.
- [ ] Give `index.ts` an honest section map. Three banners cover 1632 lines, lines 1–467 have none,
  and the last one, `// --- log.fetch helpers ---` at 1156, therefore stands over `class Log`
  (1261–1632) — 372 lines that are not fetch helpers, so a reader scrolling up from the constructor
  is told where they are and told wrong. Both architect seats named this the worst navigational
  defect in the repo, and it is five comment lines.
- [ ] Scope advisories 2 and 5 to v2.3.0, the way advisory 1 already scopes itself. `log.fetch`,
  both allow-lists and `captureQuery` all shipped there, so both exposures have the same floor and
  a consumer upgrading from 2.2.0 can close the search in one sentence.

### Ask before cutting

- [ ] Settle whether an unsampled incoming `traceparent` is meant to stop **log records** or only
  spans. Today `log()` returns before `enqueue` when `sampled` is false, so a consumer behind a
  sampling gateway loses every exported record for unsampled requests — error records included —
  with console output unchanged and no opt-out. OTel has no log-record sampler: a record carries the
  trace flags and the log pipeline exports it regardless, so gating spans is correct and gating
  records is this library's own choice. The answer decides whether 2.4.0 ships a code change or a
  reworded bullet, and it wants a decision entry either way.

## 2.5.0 — close the credential story

### Security

- [ ] Keep a url nested in the request path out of `url.full`. `buildUrlFull` is `url.origin +
  url.pathname` and redacts only the query, so
  `log.fetch("https://proxy.test/fetch/https://user:pass@cb.test/x")` exports that password with no
  capture option involved — the one credential shape that reaches a span on the default path,
  against Goals' "nothing you put in a url reaches a span". A fetch-through proxy, a CORS or image
  proxy, a webhook replay endpoint and a signed-url wrapper all take that shape, and
  percent-encoding it changes nothing. `capturedValue` already holds the rule; what it does not
  settle is the cost, because a path is not a value: replacing the whole of it on a hit loses the
  endpoint the telemetry reader needs, where `/a//b@2x.png` would take the path with it, and
  splicing `REDACTED@` in the way `spanFailure` does covers the literal spelling only. Decide
  which, and record it beside the 2026-09-20 entry that settled the same question for values.
  The 2.4.0 CHANGELOG carries this as an open exposure with a rotation advisory.
- [ ] Keep credentials off `log.conf` and `queue.conf`, which the README documents as public. Two
  spellings carry one: `otlpHttpBaseURI` holds `user:pass@` verbatim, and `otlpAdditionalHeaders`
  holds a bearer token verbatim — the second being the spelling the docs steer people to, so it is
  the likelier leak. A consumer who logs their own conf, as the README's own library example spells
  `JSON.stringify(options.settings)`, puts either in their log store. No library path emits them.
  Dropping the keys is breaking and waits for the 3.0.0 item that makes `otlpQueue` the only OTLP
  representation; redacting in place is not, and `isQueueFor`'s exact-string compare survives it as
  long as both sides are redacted the same way. Weigh the two before writing either.
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
  otherwise: the `traceparent` skip-set fix, the conf redaction above and the `spanName` warning all
  land in them. Refactor first and 3.0.0's diff gets smaller.
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

README → Audience promises a 2.x warning before each break below, so 3.0.0 waits on this release.

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
- [ ] OTLP metrics as a stateless pass-through: encode an already-aggregated point, batch it
  through `Queue` and POST it to `/v1/metrics`, with the types carrying what a valid point must
  have. Measure what the metrics messages add to the protobuf encoder against the 10 KB budget
  before deciding.

## 3.0.0 — breaking

- [ ] Give the redaction sentinel its own name — `REDACTED by @larvit/log` or similar. Today one
  token means three things to the telemetry reader: a header redacted by name, a value that matched
  a credential shape, and a value the consumer's own app had already redacted upstream. `REDACTED`
  shipped in 2.3.0 and `log.span` is a stated contract, so renaming it waits for the major.
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
  Today `log.conf.otlpHttpBaseURI` stays readable, which is why this waits for a major. It lands on
  the constructor 2.5.0 already split.
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
