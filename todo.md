# Todo

Every item sits under the release that ships it, and a release that holds anything a consumer must
act on leads with `### Security`, the shape AGENTS.md → Working here already sets for
`CHANGELOG.md`. Per README → Audience, everything breaking is deprecated in a 2.x minor first and
lands in 3.0.0 with a `MIGRATION.md` entry.

## Open question, ahead of every release below

Settle whether README → Goals' "A credential never leaves. Nothing you put in a url, a header or a
conf reaches a span, a record or `stderr`" is the target or the claim. Read as a claim it is now
contradicted by three things the repo documents itself: a url nested in the request path, a header
or query value that simply is a secret, and `otlpHttpBaseURI` sitting on `log.conf`. Read as a
target it is exactly right and both 2026-09-20 decisions derive from it. A goal is the human's to
word, and the answer re-sorts 2.5.0 below, so it comes first.

## 2.4.0

Nothing left. `CHANGELOG.md` → `## Unreleased` holds it: five credential leaks closed with four
rotation advisories, the export queue, the injectable clock, `Logger`, and the `entryFormatter` and
level-string deprecations. Ready to cut.

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
- [ ] Keep `otlpHttpBaseURI` credentials off `log.conf` and `queue.conf`, which the README
  documents as public: the URI sits there verbatim, so a consumer who logs their own conf — as
  the README's own library example spells `JSON.stringify(options.settings)` — puts the password
  in their log store. No library path emits it. Dropping the key is breaking and waits for the
  3.0.0 item that makes `otlpQueue` the only OTLP representation; redacting the userinfo in place
  is not, and `isQueueFor`'s exact-string compare survives it as long as both sides are redacted
  the same way. Weigh the two before writing either.
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
