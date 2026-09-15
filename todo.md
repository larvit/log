# Todo

Findings from the 2026-09-15 README review that need code or CI changes, not documentation.

## Deriving instances

- [ ] A child (`parentLog`) that sets its own `context` replaces the parent's wholesale
  (`Log` constructor copies each `parentLog.conf` key only when unset), while `clone()` merges per
  key. One rule for both; a library doing `new Log({ parentLog: options.log, context: {…} })`
  currently strips everything the consumer set, `service.name` included.
- [ ] A child inherits the parent's `spanName`; `clone()` excludes it. Exclude it in the constructor
  too, so an unnamed child does not masquerade as its parent.
- [ ] A child's log entries attach to the parent's span (`Log.log` picks `parentLog.span` when it
  exists), so an operation span carries none of its own log lines. Attach to the child's own span,
  or state the rule on `LogInt`.
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
