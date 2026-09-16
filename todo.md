# Todo

## Deriving instances

- [ ] A child (`parentLog`) that sets its own `context` replaces the parent's wholesale
  (`Log` constructor copies each `parentLog.conf` key only when unset), while `clone()` merges per
  key. One rule for both; a library doing `new Log({ parentLog: options.log, context: {…} })`
  currently strips everything the consumer set, `service.name` included.
- [ ] A child inherits the parent's `spanName`; `clone()` excludes it. Exclude it in the constructor
  too, so an unnamed child does not masquerade as its parent.
- [ ] Switch a child's log entries to its own span. Today `Log.log` picks `parentLog.span` when it
  exists, so an operation span carries none of its own log lines while its `log.fetch` client
  spans do nest under it. OTel's rule is that a record carries the active span. No test asserts
  the current behaviour; write one for the new rule first.
- [ ] `parentLog` and `traceparent` cannot be combined; only `clone({ traceparent })` inherits
  settings and joins an upstream trace, and `clone` is not on `LogInt`. Either let `traceparent`
  win when both are given, or add `clone` to `LogInt`.
- [ ] The constructor mutates the caller's options object (fills defaults into it). Copy first, so
  a reused options object is not silently changed.

## Interface for libraries

- [ ] `LogInt` has eleven members; a library only needs the six level methods, but an adapter for
  another logger must fake `conf`, `span`, `fetch`, `traceparent` and `end`. Split a minimal
  `Logger` (levels only) from the full nesting shape.
- [ ] No level check. A library that builds expensive metadata must compare
  `LogLevels[level].severityNumber` against `conf.logLevel` itself; add `log.enabled(level)`.
- [ ] `MetadataValue` excludes `undefined`, so `{ port: options.port }` with an optional field fails
  to type-check. Accept `undefined` and skip it on output, or keep the exclusion and say so on
  the type.
- [ ] `context` wins over per-call metadata on a key collision (`{ ...metadata, ...this.context }`
  in `Log.log`). Decide which should win.

## Failure channels

- [ ] Calling a level method or `fetch()` after `end()` throws synchronously, `end()` rejects.
  The rest of the API never throws for control flow; make them no-ops with a warning, or return
  `{ err }` from `end()`. `ended` is not on `LogInt`, so a library cannot even check first.
- [ ] `OTLP_EXPORT_TIMEOUT_MS` is a fixed 3 s per request, so `await end()` takes up to ~6 s against
  a dead collector. Make it an option.

## OTLP transport

- [ ] No batching: `Log.log` POSTs every record on its own (`otlpCall` per call), and every span is
  its own POST. A mobile app at 38k lines/week pays a request and a TLS handshake per line on
  cellular, against priority 4 (low footprint). 1.x advertised `otlpMaxExportBatchSize`,
  `otlpMaxQueueSize` and `otlpScheduledDelayMillis` without implementing them; 2.0.0 removed them.
  Add a bounded queue flushed by size and by time.
- [ ] No retry: a failed export writes one stderr line and drops the record, so a down collector
  also produces a stderr line per log line. The queue above gives retry with backoff and one
  stderr line per failed batch. Per AGENTS.md → Audience the queue persists across app restarts:
  a storage adapter option (AsyncStorage on React Native, IndexedDB in browsers, none on servers).
- [ ] Export fetches do not set `keepalive: true`, so a closing browser tab or a backgrounding app
  cancels them. Set it; batches must then stay under the 64 KB keepalive limit.
- [ ] JSON export accepts a 200 only when the body is exactly `{}` or `{"partialSuccess":{}}`;
  the spec allows `partialSuccess` with counts and a message on 200. Treat 2xx as success and
  warn on a non-zero rejected count.
- [ ] Protobuf on React Native: `ProtoWriter.string` is the only `TextEncoder` use
  (`index.ts:413`); the JSON path is unaffected. Reported absent in React Native 0.81.5 and Expo
  54 from the shipped JS, unconfirmed on-device. Add a UTF-8 fallback (~10 lines) or document
  protobuf as server-only.

## Simplify

- [ ] `format` and `entryFormatter` are two spellings of one setting, and `format` is silently
  ignored when both are given. Keep one; reject the other at construction.
- [ ] `new Log("level")` and `new Log({ logLevel })` are two spellings. Decide whether the
  shorthand earns its place.
- [ ] `OtlpLogPayload`, `OtlpSpanPayload`, `OtlpAttribute` and `ResolvedLogConf` are exported wire
  and internal shapes; a consumer that names them pins the internals. Deprecate in a minor,
  unexport in the next major with a `MIGRATION.md` entry (AGENTS.md → Audience).
- [ ] Text format always emits ANSI colour codes, TTY or not, so files and journald get escape
  sequences. Detect a TTY where the runtime exposes one, or drop the colours.
- [ ] Bundle size is 15.0 KB minified, 4.7 KB gzipped (2.3.0). Add a size badge so priority 4 has
  a number that cannot go stale.

## Missing

- [ ] No way to mark an instance's own span as failed: `status.code` is only ever set by
  `log.fetch`. An operation that fails cannot show red in the trace. Add `end({ error })` or let
  `log.error()` set the status.

## Defaults and spec

- [ ] `spanName` defaults to `"unnamed-span"` and `service.name` to `"unnamed-service"`; a backend
  then shows every unnamed span/service under one bucket. Require `spanName` when
  `otlpHttpBaseURI` is set, or derive it.
- [ ] W3C Trace Context is partial. `traceparent` is parsed, adopted, formatted and injected by
  `log.fetch`, but: the incoming `sampled` flag is parsed and ignored (spans always export and
  outgoing headers always say `01`); `tracestate` is neither read nor forwarded; and version `ff`
  is accepted although the spec forbids it.

## CI

- [ ] `.github/workflows/master.yaml` is named after the old default branch; rename to `push.yaml`
  (its `name:` is already `Push`) and update the README badge URL.
