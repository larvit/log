# AGENTS

Guidance for agents working on `@larvit/log`. Keep changes aligned with the README's goals.

## Goals, audience and personas

[README](README.md) → Goals and Audience. They are the public statement of where this is heading
and who it is for, and a design decision that cannot be derived from them belongs in the decision
log.

## Decisions

In [docs/decisions.md](docs/decisions.md):

- The OTLP types and `ResolvedLogConf` stay exported
- No level-string shorthand from 3.0.0
- The OTLP endpoint belongs to the queue
- `colors` precedence, and colour on by default through 2.x
- `Log` and `Queue` each own a `clock`
- `Clock` hands back the platform's timer handle
- `clock` is a supported option
- A required `Resolved*Conf` key is added in a minor and removed in a major
- This library's own warnings are written once per `stderr` sink
- `otlpHttpBaseURI` userinfo becomes an `Authorization: Basic` header
- `log.fetch` traces only `http:` and `https:` urls
- `log.fetch` passes url userinfo through, and `spanFailure` redacts it
- A captured value holding a credential records `REDACTED`
- Every rule on credentials in a span sits in one source section
- `format` is the formatter's one name, `conf.entryFormatter` its read path until 3.0.0
- `ResolvedLogConf` keeps `entryFormatter` required
- `SENSITIVE_QUERY_KEYS` grows by name
- An unsampled `traceparent` drops the span, never the log records
- An empty `logLevel` logs at `info` and warns
- The default `Queue` lives in `conf.otlpQueue`
- The comprehension baseline

## Working here

- New code in `index.ts` joins a `// --- name ---` section whose banner stays true of it, or gets
  its own. A rule set answering one question — what a reader has to check as a whole — lives in one
  section, never split across two.
- A done `todo.md` item leaves the file: a change a consumer can observe is reworded for them
  under `CHANGELOG.md` → `## Unreleased`; anything else is deleted outright.
- A release section with anything a consumer must act on — a rotation advisory, an exposure still
  open — leads with `### Security` holding it, ahead of `### Everything else`; one with none omits
  both headings. Thirty flat bullets is where a rotation notice goes unread.
- Tests-first. The suite (`test.ts`) injects `stdout`/`stderr` and stubs the global `fetch`, so the same tests cover console + OTLP in both Node and the browser.
- See [README](README.md) for build/test/release commands.
