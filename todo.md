# Todo

Plan for 3.0.0. Per AGENTS.md → Audience, everything breaking is deprecated in a 2.x minor
first and lands in 3.0.0 with a `MIGRATION.md` entry. Additive work ships in 2.x as it is done.

## Security

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
- [ ] Report a 401 or 403 export as `OTLP export unauthorized, batch dropped`, not as the generic
  rejection. Working auth makes a wrong credential reachable for the first time, and it is the
  likeliest misconfiguration of `otlpHttpBaseURI` userinfo; today it reads as any other 4xx.
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
- Not added: sampling beyond the incoming flag, `tracestate`, span events, resource attributes
  beyond `service.name`. Each pulls toward being an SDK, against priority 2.
