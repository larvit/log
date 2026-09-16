# Todo

Plan for 3.0.0. Per AGENTS.md → Audience, everything breaking is deprecated in a 2.x minor
first and lands in 3.0.0 with a `MIGRATION.md` entry. Additive work ships in 2.x as it is done.

## 2.x minors, before 3.0.0

### Additive

- [ ] `Logger` type: the six level methods plus `enabled(level)`, so a library can skip building
  expensive metadata. `LogInt = Logger & { conf, end, fetch, flush, span, traceparent }`.
  Libraries accept `Logger`; `parentLog` stays `LogInt`.
- [ ] `MetadataValue` accepts `undefined`; such keys are dropped on output.
- [ ] `end({ error })` marks the instance's span failed: status `ERROR`, `error.type` from the
  error's `code`, else `name`, and the message as the status message. `log.error()` does not
  mark the span; a logged and recovered error is not a failed operation.
- [ ] Export queue, pluggable through an `otlpQueue` option:
  - `OtlpQueue` interface: `enqueue({ path, payload })`, `flush(): Promise<void>`. Batching by
    size and time, retry with backoff, `keepalive: true` on the fetch and the 64 KB keepalive cap
    per batch all live in the queue, not in `Log`.
  - `MemoryQueue`, the default. Bounded; drops oldest when full and reports the count once.
  - `PersistentQueue({ storage })`, where `storage` is `{ getItem, setItem, removeItem }`, sync or
    async: AsyncStorage on React Native, `localStorage` in browsers. Survives app restarts.
  - `log.flush()` flushes without ending. `end()` flushes after closing the span.
  - One stderr line per failed batch, not per record.
  - `OtlpLogPayload`/`OtlpSpanPayload` stay exported: queue implementers need them.
- [ ] `colors?: boolean` for the text format. Default: on when `process.stdout.isTTY` is true
  and `NO_COLOR` is unset, else off.
- [ ] Protobuf on React Native: replace `new TextEncoder()` in `ProtoWriter.string` with a UTF-8
  fallback when the global is missing. Confirm the absence on-device first.
- [ ] JSON export: any 2xx is success; warn on a non-zero `partialSuccess` rejected count.
- [ ] W3C: reject version `ff`; honour the incoming `sampled` flag (unsampled: no export, header
  says `00`). `tracestate` stays out of scope.
- [ ] Constructor copies the caller's options object instead of filling defaults into it.
- [ ] Size badge in the README (2.3.0: 15.0 KB minified, 4.7 KB gzipped).
- [ ] Rename `.github/workflows/master.yaml` to `push.yaml`; update the README badge.

### Deprecations (warn once on stderr)

- [ ] `new Log("level")` and `clone("level")`: use `{ logLevel }`.
- [ ] `entryFormatter`: use `format`, which also accepts `(entry) => string`.
- [ ] `parentLog` together with `traceparent` (today `traceparent` is silently ignored).

## 3.0.0, breaking

- [ ] Remove the level-string shorthand from `Log` and `clone`.
- [ ] Remove `entryFormatter`. `format` is `"text" | "json" | ((entry) => string)`.
- [ ] A child's log records attach to its own span. OTel's rule is that a record carries the
  active span, and a child's `log.fetch` spans already nest under it. No test asserts the old
  behaviour; write one for the new rule first.
- [ ] Per-call metadata wins over `context` on a key collision; the more specific value wins.
- [ ] A child merges `context` per key with the parent's, as `clone()` does.
- [ ] A child does not inherit `spanName`; default `"unnamed-span"` for both derivations.
- [ ] `parentLog` with `traceparent`: settings inherit from `parentLog`, the span nests under the
  upstream `traceparent`. This is the request-handler case and today it silently loses the trace.
- [ ] Nothing throws after `end()`. Level methods still write to the console and their OTLP
  records attach to the ended span, entering the queue like any other record, so the queue's
  size/time flush exports them with no further call. `end()` a second time resolves `{ err }`.
  `ended` joins `LogInt`.
- [ ] Require `spanName` whenever `otlpHttpBaseURI` is set or inherited: a child or clone of an
  OTLP-configured instance must name its span, and the constructor rejects one that does not.
  No backend shows `unnamed-span`.
- [ ] `MIGRATION.md`: one entry per item above, with the 2.x spelling and the 3.0.0 spelling.

## Kept as is, decided 2026-09-16

- Protobuf encoder stays; collectors that reject JSON are real, and the whole file is 4.7 KB gz.
- Not added: sampling beyond the incoming flag, `tracestate`, span events, resource attributes
  beyond `service.name`. Each pulls toward being an SDK, against priority 2.
