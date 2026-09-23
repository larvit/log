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
  minor; removing one, or making it optional, waits for a major, because a consumer reading that
  key stops compiling. They are output types describing what the library produces; a consumer
  hand-building one is writing a test double, not running existing code. Precedent: `colors` did
  the same.
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

- 2026-09-20: a value `log.fetch` copies onto a span records `REDACTED` in place of the whole value
  where it holds a credential, per README → Goals' "a credential never leaves". One rule for
  captured header values and for the query values `captureQuery` keeps — and for a query key, since
  a url written as a bare key reaches `url.full` the same way its value would — because the same
  credentialed url arrives by every one of those routes and separate rules would disagree the way
  the two allow-lists used to: `authorization`, `proxy-authorization`, `cookie` and `set-cookie` go by
  name, and everything else goes by whether the value holds url userinfo raw or once decoded — a
  nested url is normally percent-encoded, which hides the `//` and `@` from `URL_USERINFO`. The
  decode runs escape-run by escape-run rather than over the whole string, because
  `decodeURIComponent` throws on the first invalid escape: a stray `%` anywhere in a header, which
  a WHATWG url permits, would otherwise take the decoded test out for the credential encoded
  correctly beside it. Redacting rather than rejecting the allow-list entry is what a minor
  allows — README → Goals #4 deprecates a breaking change in a 2.x minor first, and the leak is
  open now — and it matches the stance `SENSITIVE_QUERY_KEYS` already took. `REDACTED` over
  dropping the attribute keeps the telemetry reader's "was the header there?", which is what an
  allow-list is for once the value is gone. `spanFailure` keeps splicing `REDACTED@` into the url
  instead, because there the surrounding text is a message a human reads and the encoding is the
  runtime's own; a captured value's encoding is the caller's, so rewriting inside it would report
  something they never sent. The four names are the ones whose value is a credential by definition
  (RFC 9110 authentication, RFC 6265 cookies). What this does not reach, and the README says so, is
  a header whose value simply is a secret — `x-api-key`, a signed token — which no shape
  distinguishes from any other string. Over-redaction stays the safe direction, as the entry above
  has it, but the cost is higher here than in a status message: the reader loses the whole
  attribute, so a `location` of `https://cdn.test//logo@2x.png` records `REDACTED`. Weighed against
  README → Audience #3 and taken, because Goals ranks the credential above the reader, and the
  README says it so that reader is not left guessing. Valid while an allow-list names header names,
  not patterns.

- 2026-09-20: every rule deciding whether a credential reaches a span sits in one region,
  `// --- Credentials on a span ---`, grouped by that question and not by the caller asking it, so
  `traceableUrl` and `buildUrlFull` are there and not beside `log.fetch`. README → Goals #3 is
  checkable only against the whole set, and the rules used to sit in two places ~800 lines apart
  with the call running upward and no comment at either end naming the other. Neither the banner
  nor this entry lists the routes in: prose has nothing keeping a count true, and the
  userinfo-free-by-construction choices at the `log.fetch` call site are not rules this region
  holds. Scoped to spans because the remaining credential rules are
  the queue's, and 2.5.0's conf-redaction and Basic-over-`http:` items rewrite that code. Valid while
  the source is a single `index.ts`.

- 2026-09-21: `format` is the formatter's one name, and `conf.entryFormatter` a deprecated alias of
  it, read and write, until 3.0.0 drops both. `entryFormatter` folds into `format`, winning over a
  `"text"`/`"json"` one as 2.x documented, and two *different* formatters throw: nothing can hold
  that combination yet, while rejecting the documented one would break a minor. An `entryFormatter`
  reaching an instance through inheritance is never folded, which only a hand-built parent conf can
  do. The alias stays because v2.3.0 filled `conf.entryFormatter` on every instance, whichever
  spelling set the formatter; it is one module-level descriptor, because a closure pair per `Log`
  measured 1347 bytes against Goals #7's 1 KB, on `node:22-bookworm-slim` over 50 000 retained
  instances. The formatter is resolved from `conf.format` where a line is written, so writing it
  takes effect on a live instance, like `logLevel` and the sinks. Serves README → Goals #5 for the
  one name, README → Goals #4 for the alias. Valid until 3.0.0 removes `entryFormatter`.
- 2026-09-21: `ResolvedLogConf` keeps `entryFormatter` in its required half while the property is
  non-enumerable, so a spread's type promises a formatter the spread does not carry. Accepted
  rather than fixed: v2.3.0 shipped the member required and a minor may not narrow it, per the
  required-half entry above, and no type can say "non-enumerable". `todo.md`'s 3.0.0 item closes
  it. Valid until 3.0.0 removes `entryFormatter`.

- 2026-09-23: `SENSITIVE_QUERY_KEYS` names the access key, session token and signature parameter of
  every query-signing generation AWS and Google Cloud have shipped, on top of OTel semconv's default
  four, which name no SigV4 key: `X-Amz-Signature` was the one replayable leak. Names, because a presigned url's credentials have no
  shape that tells them from any other opaque value, and the semconv list is a default and not a
  maximum, so more names break no spec. An access key id and a `GoogleAccessId` are identifiers,
  not secrets, and are redacted anyway: semconv already redacts `AWSAccessKeyId`, and a reader who
  needs the key knows which bucket they fetched from. The rest of a presigned url is kept, because
  `X-Amz-Date` and `X-Amz-Expires` are what README → Audience #3 reads to explain a 403. Serves
  README → Goals #3; over-redaction in a minor stands on the 2026-09-20 captured-value entry. A
  vendor not named here, or a bearer token carried as a query parameter, is an addition to the
  set and not a change of rule. The advisory scopes rotation to unexpired urls: the signature, key
  id and session token reveal no secret alone, so the url itself is the leaked capability, dead
  once it expires. Valid while the deny-list names query keys, not shapes.

## Working here

- Source is a single `index.ts`, sectioned by `// --- name ---` banners. New code joins a
  section whose banner stays true of it, or gets its own. A rule set answering one question — what
  a reader has to check as a whole — lives in one section, never split across two.
- A done `todo.md` item leaves the file: a change a consumer can observe is reworded for them
  under `CHANGELOG.md` → `## Unreleased`; anything else is deleted outright.
- A release section with anything a consumer must act on — a rotation advisory, an exposure still
  open — leads with `### Security` holding it, ahead of `### Everything else`; one with none omits
  both headings. Thirty flat bullets is where a rotation notice goes unread.
- Tests-first. The suite (`test.ts`) injects `stdout`/`stderr` and stubs the global `fetch`, so the same tests cover console + OTLP in both Node and the browser.
- See [README](README.md) for build/test/release commands. Keep the README and this file in sync with any priority or workflow change.
