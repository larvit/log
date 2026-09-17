# Todo

Plan for 3.0.0. Per AGENTS.md → Audience, everything breaking is deprecated in a 2.x minor
first and lands in 3.0.0 with a `MIGRATION.md` entry. Additive work ships in 2.x as it is done.

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
- [ ] Replace `new TextEncoder()` in `ProtoWriter.string` with a UTF-8 fallback when the global
  is missing, so protobuf export works on React Native. Confirm the absence on-device first.
- [ ] Treat any 2xx as JSON export success and warn on a non-zero `partialSuccess` rejected
  count. Today only a body of exactly `{}` or `{"partialSuccess":{}}` passes.
- [ ] Reject `traceparent` version `ff` and honour the incoming `sampled` flag: unsampled means no
  export and an outgoing header saying `00`. Today `ff` is accepted and `sampled` ignored.
  `tracestate` stays out of scope.
- [ ] Copy the caller's options object in the constructor instead of filling defaults into it.
- [ ] Inject one clock (`now`, `setTimeout`, `clearTimeout`) behind span and record timestamps and
  the `Queue` timers, so tests assert exact times instead of "within an hour" and the retry
  schedule, its 30 s cap included, without waiting.
- [ ] Add a size badge to the README (2.3.0: 15.0 KB minified, 4.7 KB gzipped).
- [ ] Rename `.github/workflows/master.yaml` to `push.yaml` and update the README badge.

### Deprecations (warn once on stderr)

- [ ] Deprecate `new Log("level")` and `clone("level")` in favour of `{ logLevel }`.
- [ ] Deprecate `entryFormatter` in favour of `format`, and make `format` also accept
  `(entry) => string`.
- [ ] Deprecate `parentLog` together with `traceparent`. Today `traceparent` is silently ignored.
- [ ] Warn once when `colors` is unset and `process.stdout.isTTY` is false or `NO_COLOR` is set,
  where 3.0.0 turns colour off.

## 3.0.0, breaking

- [ ] Remove the level-string shorthand from `Log` and `clone`.
- [ ] Remove `entryFormatter`; `format` is `"text" | "json" | ((entry) => string)`.
- [ ] Default `colors` to on only when `process.stdout.isTTY` is true and `NO_COLOR` is empty or
  unset. The detection and its tests are in commit 9706b0a.
- [ ] Attach a child's log records to its own span instead of the parent's. OTel's rule is that a
  record carries the active span, and a child's `log.fetch` spans already nest under it. No test
  asserts the old behaviour; write one for the new rule first.
- [ ] Let per-call metadata win over `context` on a key collision; the more specific value wins.
  Today `context` wins.
- [ ] Merge a child's `context` per key with the parent's, as `clone()` does. Today a child's
  `context` replaces the parent's wholesale.
- [ ] Stop a child inheriting `spanName`; default to `"unnamed-span"` for both derivations.
- [ ] Allow `parentLog` with `traceparent`: settings inherit from `parentLog`, the span nests under
  the upstream `traceparent`. This is the request-handler case; today it silently loses the trace.
- [ ] Make nothing throw after `end()`. Level methods still write to the console and their OTLP
  records attach to the ended span, entering the queue like any other record, so the queue's
  size/time flush exports them with no further call. `end()` a second time resolves `{ err }`.
  Add `ended` to `LogInt`.
- [ ] Keep `otlpQueue` as the only OTLP representation in `conf`: build the default `Queue` from
  the three `otlp*` shorthands and clear them, so inheritance needs one rule and `isQueueFor` goes.
  Today `log.conf.otlpHttpBaseURI` stays readable, which is why this waits for a major.
- [ ] Require `spanName` whenever `otlpQueue` is set or inherited: a child or clone of an
  OTLP-configured instance must name its span, and the constructor rejects one that does not, so
  no backend shows `unnamed-span`.
- [ ] Write `MIGRATION.md`: one entry per item above, with the 2.x spelling and the 3.0.0 spelling.

## Kept as is, decided 2026-09-16

- Protobuf encoder stays; collectors that reject JSON are real, and the whole file is 4.7 KB gz.
- Not added: sampling beyond the incoming flag, `tracestate`, span events, resource attributes
  beyond `service.name`. Each pulls toward being an SDK, against priority 2.
