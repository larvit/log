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
- 2026-09-17: `colors` precedence is code, then `NO_COLOR`, then `FORCE_COLOR`, then the default.
  The default stays on through 2.x: a terminal is a new user's first sight of the library, and a
  minor never changes output for a consumer whose env says nothing. Following the TTY is a 3.0.0
  change; Rails' always-on `colorize_logging` is the precedent for what unconditional colour costs
  log pipelines. Valid while text is the default format.
- 2026-09-18: `Log` and `Queue` each own a `clock`, because each is usable without the other. A
  `Log` passes its clock to the default `Queue` it builds; a `Queue` the consumer built keeps its
  own, like its endpoint, since a `Log` must not mutate a queue it may share. Valid while a queue
  is independently constructible.
- 2026-09-18: `Clock` is `{ now, setTimeout, clearTimeout }` with an exported `TimerHandle`, not a
  `setTimeout` returning a cancel function. `unref` needs the real handle to keep a pending retry
  from holding a Node or Deno process alive, and only the retry timer is unref'd; the `| number`
  arm is what lets a browser, React Native or test clock type-check against types built with
  `"types": ["node"]`. A clock that delegates to platform timers is unref'd like the system one;
  only Deno's numeric `unrefTimer` is skipped for an injected clock, since the id is not its own.
  Valid while a pending retry must not hold the process open.
- 2026-09-18: `clock` is a supported option, not a test-only seam. Valid while a delegating clock
  leaves process-exit behaviour intact.
- 2026-09-18: adding a key to `ResolvedLogConf`/`ResolvedQueueConf`'s required half ships in a
  minor. They are output types describing what the library produces; a consumer hand-building one
  is writing a test double, not running existing code. Precedent: `colors` did the same.

## Working here

- Source is a single `index.ts`, compiled + uglified to `index.js` for publish.
- Tests-first. The suite (`test.ts`) injects `stdout`/`stderr` and stubs the global `fetch`, so the same tests cover console + OTLP in both Node and the browser.
- See [README](README.md) for build/test/release commands. Keep the README and this file in sync with any priority or workflow change.
