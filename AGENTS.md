# AGENTS

Guidance for agents working on `@larvit/log`. Keep changes aligned with the priorities below.

## What this is

Structured logging with a tiny API and first-class OTLP (logs + traces) over `fetch`, with no OpenTelemetry SDK dependency. Works as a plain stdout/stderr logger when OTLP is not configured.

## Design priorities (in order)

1. **Works everywhere** — Node.js, Bun, Deno and other server runtimes, plus browsers and React Native. Lean on the common JS surface (global `fetch`); add fallbacks where a runtime lacks an API rather than dropping support.
2. **A very easy API** — "just log" must stay trivial. Don't make the caller learn OTLP to use it.
3. **Composable** — instances inherit context/spans/traces and can attach to upstream headers/spans/traces. Favour designs that slot into existing setups.
4. **Low footprint for the consumer** — minimise runtime cost and install weight shipped to consumers. Dev-time build/codegen steps in this repo are fine, as long as they don't reach consumers.

## Working here

- Source is a single `index.ts`, compiled + uglified to `index.js` for publish.
- Tests-first. The suite (`test.ts`) injects `stdout`/`stderr` and stubs the global `fetch`, so the same tests cover console + OTLP in both Node and the browser.
- See [README](README.md) for build/test/release commands. Keep the README and this file in sync with any priority or workflow change.
