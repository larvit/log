# AGENTS

Guidance for agents working on `@larvit/log`. Keep changes aligned with the priorities below.

## What this is

Structured logging with a tiny API and first-class OTLP (logs + traces) over `fetch`, with no OpenTelemetry SDK dependency. Works as a plain stdout/stderr logger when OTLP is not configured. `log.fetch()` auto-instruments outgoing HTTP (client spans + W3C `traceparent` propagation); the `traceparent` option joins upstream traces.

## Design priorities (in order)

1. **Works everywhere** — Node.js, Bun, Deno and other server runtimes, plus browsers and React Native. Lean on the common JS surface (global `fetch`); add fallbacks where a runtime lacks an API rather than dropping support.
2. **A very easy API** — "just log" must stay trivial. Don't make the caller learn OTLP to use it.
3. **Composable** — instances inherit context/spans/traces and can attach to upstream headers/spans/traces. Favour designs that slot into existing setups.
4. **Low footprint for the consumer** — minimise runtime cost and install weight shipped to consumers. Dev-time build/codegen steps in this repo are fine, as long as they don't reach consumers.

## Audience (decided 2026-09-16)

- Consumers are the public npm audience, not only larvit's own apps. A breaking change is
  deprecated in a minor first and lands in the next major with a `MIGRATION.md` entry.
- A mobile app on cellular with offline periods is a primary target, equal to servers. An export
  queue must survive app restarts (storage adapter: AsyncStorage on React Native, IndexedDB in
  browsers, none on servers). Valid while a larvit mobile app ships this library.
- Personas the README serves, in order: the app developer wiring logs and traces into a service
  or app; the library author accepting a logger from their consumer.

## Decisions

- 2026-09-16: `format` is the one formatting option; it takes `"text"`, `"json"` or a function.
  `entryFormatter` is removed in 3.0.0. Valid while there is one formatter per instance.
- 2026-09-16: the OTLP types (`OtlpSpan`, `OtlpAttribute`, `OtlpLogPayload`, `OtlpSpanPayload`)
  and `ResolvedLogConf` stay exported. `log.span` and `log.conf` are public, so declaration emit
  requires the first two and the last; queue implementers need the payloads.
- 2026-09-16: no level-string shorthand; `{ logLevel }` is the one spelling from 3.0.0.
- 2026-09-16: the OTLP endpoint belongs to the queue. `otlpHttpBaseURI`, `otlpProtocol` and
  `otlpAdditionalHeaders` on `Log` are shorthand for a default `Queue` and are rejected beside an
  `otlpQueue` they did not build. One `Queue` class, in memory or persisted through `storage`; a
  second implementation needs a reason a `storage` cannot give. Valid while a queue owns the
  transport.

## Working here

- Source is a single `index.ts`, compiled + uglified to `index.js` for publish.
- Tests-first. The suite (`test.ts`) injects `stdout`/`stderr` and stubs the global `fetch`, so the same tests cover console + OTLP in both Node and the browser.
- See [README](README.md) for build/test/release commands. Keep the README and this file in sync with any priority or workflow change.
