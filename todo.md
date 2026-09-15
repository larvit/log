# Todo

Findings from the 2026-09-15 README review that need code or CI changes, not documentation.

- [ ] `context` wins over per-call metadata on a key collision (`{ ...metadata, ...this.context }` in
  `Log.log`). A caller writing `log.info("x", { requestId })` under a context that also has
  `requestId` silently loses their value. Decide which should win and document it.
- [ ] A child (`parentLog`) that sets its own `context` replaces the parent's wholesale, while
  `clone()` merges per key. Two spellings of "derive an instance" with different context rules;
  pick one.
- [ ] `spanName` defaults to `"unnamed-span"` and `service.name` to `"unnamed-service"`; a backend
  then shows every unnamed span/service under one bucket. Consider requiring `spanName` when
  `otlpHttpBaseURI` is set, or deriving it.
- [ ] Calling a level method, `fetch()` or `end()` after `end()` throws. The rest of the API never
  throws for control flow; consider a no-op with a warning, or return `{ err }` from `end()`.
- [ ] W3C Trace Context is partial. `traceparent` is parsed, adopted, formatted and injected by
  `log.fetch`, but: the incoming `sampled` flag is parsed and ignored (spans always export and
  outgoing headers always say `01`); `tracestate` is neither read nor forwarded; and version `ff`
  is accepted although the spec forbids it.
- [ ] `.github/workflows/master.yaml` is named after the old default branch; rename to `push.yaml`
  (its `name:` is already `Push`) and update the README badge URL.
