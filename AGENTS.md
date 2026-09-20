# AGENTS

Guidance for agents working on `@larvit/log`. Keep changes aligned with the README's goals.

## What this is

Structured logging with a tiny API and first-class OTLP (logs + traces) over `fetch`, with no OpenTelemetry SDK dependency. Works as a plain stdout/stderr logger when OTLP is not configured. `log.fetch()` auto-instruments outgoing HTTP (client spans + W3C `traceparent` propagation); the `traceparent` option joins upstream traces.

## Goals, audience and personas

[README](README.md) → Goals and Audience. They are the public statement of where this is heading
and who it is for, and a design decision that cannot be derived from them belongs in the log below.

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
  only Deno's numeric `unrefTimer` is skipped for an injected clock, whose id may not be Deno's.
  Valid while a pending retry must not hold the process open.
- 2026-09-18: `clock` is a supported option, not a test-only seam. Valid while a delegating clock
  leaves process-exit behaviour intact.
- 2026-09-18: adding a key to `ResolvedLogConf`/`ResolvedQueueConf`'s required half ships in a
  minor. They are output types describing what the library produces; a consumer hand-building one
  is writing a test double, not running existing code. Precedent: `colors` did the same.
- 2026-09-18: `format` and `entryFormatter` are one setting. `entryFormatter` folds into `format`,
  winning over a `"text"`/`"json"` one as 2.x documented, and two *different* formatters throw:
  nothing can hold that combination yet, while rejecting the documented one would break a minor.
  `conf.entryFormatter` mirrors the resolved `format` as a non-enumerable property, so a child or a
  spread of a `conf` carries the caller's spellings alone and an explicit `format` there now applies,
  where 2.x silently kept the parent's formatter. An `entryFormatter` reaching an instance through
  inheritance is never folded, which only a hand-built parent conf can do — a test double, per the
  required-half rule above, which also carries `ResolvedLogConf["format"]` widening to include a
  function. Valid until 3.0.0 removes `entryFormatter`.
- 2026-09-18: a deprecation warns once per `stderr` sink for each distinct warning text, through the
  instance's formatter at `warn` and whatever `logLevel` says. Instances sharing the default
  `console.error` share that one warning; a sink the caller injects gets its own, which keeps a test
  independent of run order. The key is the sink plus the message text, so keep the messages literal.
  Every deprecation line opens with `@larvit/log: `, part of that literal, so an app developer can
  tell which dependency emitted one about code they may not own. A `Queue`'s `report` lines carry no
  prefix: they report that developer's own setup, not this library's own API. Valid
  while 2.x carries deprecations.
- 2026-09-19: `otlpHttpBaseURI` userinfo is sent as an `Authorization: Basic` header, never in the
  request url. WHATWG `fetch` refuses a url carrying credentials and quotes that url into the
  `TypeError`, so keeping them there made basic auth unusable on Node and in browsers and leaked
  them into the report line of every failed attempt. A `Queue` keeps its `Content-Type` and any
  endpoint `Authorization` in one `Headers` and applies `otlpAdditionalHeaders` onto a copy per
  send, so a name overrides by any casing where the object spread this replaced could not, a
  rotated token reaches the next send, and a header the caller got wrong fails that export instead
  of the construction of their `Log`. A colon in the user-id is passed through rather than
  rejected: RFC 7617 forbids it and a server splits on the first one, so there is no reading to
  salvage. Only `http:` and `https:` are accepted, both because nothing else is fetchable and
  because any other scheme written without `//` parses to an opaque path, where the userinfo stays
  in `pathname` and the credential-free url cannot be built from its parts. `btoa` is assumed
  present beside `TextEncoder`, on the same floor as the `TextEncoder`
  entry under `todo.md`'s "Kept as is": Hermes added both (facebook/hermes#1178) and React Native
  has shipped them since 0.74. Both credential spellings stand meanwhile: a collector vendor
  hands `user:pass@` over as one string, and dropping it in a minor would break those consumers,
  so `todo.md` carries the question rather than this entry settling it. Valid while a queue owns
  the transport.
- 2026-09-19: `log.fetch` traces only urls that resolve to `http:`/`https:`, the floor the queue's endpoint
  already takes. A scheme written without `//` parses to an opaque path, where `URL.origin` is the
  string `"null"` and the userinfo stays in `pathname`, so `url.full` cannot be rebuilt from the
  parts without shipping what the url holds — credentials, or a whole `data:` payload. A `blob:`,
  `data:` or `file:` read is a local one, not a network call worth a client span. It ships in a
  minor rather than waiting for 3.0.0 because it is the security fix itself, and what it drops is
  telemetry for urls nobody traces over the network: the timing and status of those spans were
  right, their `url.full` (`nulluser:pass@host/x`, `https://example.comhttps://example.com/uuid`)
  was not. Valid while `url.full` is built from `origin` + `pathname`.
- 2026-09-20: a `log.fetch` url carrying userinfo reaches the runtime's `fetch` untouched, and
  `spanFailure` redacts the userinfo out of any url the error message quotes. It sits there, not
  at the `log.fetch` call site, because the same rejection reaches a second span through
  `end({ error })` — the handler pattern the README documents — and a caller's own `fetch`
  rejection arrives by that route too; one redaction where an error becomes a span status covers
  every sink, where a `url.username || url.password` test at the call site covered one. Turning
  the userinfo into an `Authorization: Basic` header, as `otlpHttpBaseURI` does with the same
  spelling, is what README → Goals forbids of `log.fetch`: "never a request the platform would
  not have made, and never a success the platform would have refused". The two spellings differ
  because the queue's endpoint is this library's own request to make, where `log.fetch`'s is the
  caller's, so the same string means "authenticate me" in one and "mirror what my runtime does
  with this" in the other. React Native does put them on the wire, on one of its two platforms:
  `whatwg-fetch` hands the url to `XMLHttpRequest.open` untouched and sets no header, iOS keeps
  the userinfo through `[RCTConvert NSURL:]` and runs `NSURLSession` with no challenge delegate,
  so the system answers `WWW-Authenticate` with the credentials, while Android passes the string
  to `Request.Builder().url()` and OkHttp derives no `Authorization` from it — leaving the caller
  a 401, and writing the userinfo out only in a plain-`http:` proxy's request line. Same at
  `v0.74.0` and today's `main`. Mirroring keeps that the platform's behaviour. It ships in a
  minor on the precedent of the entry above, being the security fix itself. Matching runs from
  `//` with the scheme optional, because a url a runtime could not parse comes back without one
  — Node answers `fetch("//user:pass@host/x")` with "Failed to parse URL from //user:pass@host/x".
  What it costs is over-redaction, always the safe direction: it matches to the last `@` before a
  `/?#`, so a url with an address glued to it loses its host (`https://api.test,mail@example.com`),
  and an `@` in a path after a doubled slash redacts as though it were userinfo. A bare
  `user:pass@host` with no slashes at all stays unredacted. Valid while `log.fetch` is a drop-in
  for the runtime's `fetch` and a runtime quotes the url with its authority slashes.

## Working here

- Source is a single `index.ts`, compiled + uglified to `index.js` for publish.
- A done `todo.md` item leaves the file, reworded for the consumer into `CHANGELOG.md` under
  `## Unreleased`; the `[x]` items still in the file are debt for a separate chunk.
- A release section with anything a consumer must act on — a rotation advisory, an exposure still
  open — leads with `### Security` holding it, ahead of `### Everything else`; one with none omits
  both headings. Thirty flat bullets is where a rotation notice goes unread.
- Tests-first. The suite (`test.ts`) injects `stdout`/`stderr` and stubs the global `fetch`, so the same tests cover console + OTLP in both Node and the browser.
- See [README](README.md) for build/test/release commands. Keep the README and this file in sync with any priority or workflow change.
