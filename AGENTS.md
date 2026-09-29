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
- `format` is the formatter's one name, `entryFormatter` its alias until 3.0.0
- `ResolvedLogConf` keeps `entryFormatter` required
- `SENSITIVE_QUERY_KEYS` grows by name
- An unsampled `traceparent` drops the span, never the log records
- An empty `logLevel` logs at `info` and warns
- The default `Queue` lives in `conf.otlpQueue`
- A v2.3.0 copy's child loses a function formatter
- The comprehension baseline
- A stringified `Queue` carries its `conf`, less `storage` from 2.5.0
- A url nested in a request path is cut from where it starts
- An `Authorization` over plain `http:` warns once
- `resolveFormatter` is exported
- Both credential spellings stay, and their combination warns
- Inherited `otlpAdditionalHeaders` follow the endpoint's origin
- Only whitespace ends a url a status message quotes
- A nested url spelled with whitespace in its `//` is the caller's
- Redacting a nested url may cost 3^8 passes
- An encoded url beside a raw one is cut from where it starts
- A raw nested url's escaped delimiters are read after one decode

## Working here

- New code in `index.ts` joins a `// --- name ---` section whose banner stays true of it, or gets
  its own. A rule set answering one question — what a reader has to check as a whole — lives in one
  section, never split across two.
- A done `todo.md` item leaves the file: a change a consumer can observe is reworded for them
  under `CHANGELOG.md` → `## Unreleased`; anything else is deleted outright.
- A release section opens with a few lines on its most important changes, and each bullet with a
  bold one-sentence tagline of the change, so the taglines alone say what the release holds.
- A release section with anything a consumer must act on — a rotation advisory, an exposure still
  open — puts `### Security` holding it right after that intro, ahead of `### Everything else`;
  one with none omits both headings. Thirty flat bullets is where a rotation notice goes unread.
- Tests-first. The suite (`test.ts`) injects `stdout`/`stderr` and stubs the global `fetch`, so the same tests cover console + OTLP in both Node and the browser.
- See [README](README.md) for build/test/release commands.
- Don't wait on CodeRabbit: under 10 stars it reviews only when triggered by hand.
