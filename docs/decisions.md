# Decisions

## The OTLP types and `ResolvedLogConf` stay exported

2026-09-16: the OTLP types (`OtlpSpan`, `OtlpAttribute`, `OtlpLogPayload`, `OtlpSpanPayload`)
and `ResolvedLogConf` stay exported. `log.span` and `log.conf` are public, so declaration emit
requires the first two and the last; queue implementers need the payloads.

## No level-string shorthand from 3.0.0

2026-09-16: no level-string shorthand; `{ logLevel }` is the one spelling from 3.0.0.

## The OTLP endpoint belongs to the queue

2026-09-16: the OTLP endpoint belongs to the queue. `otlpHttpBaseURI`, `otlpProtocol` and
`otlpAdditionalHeaders` on `Log` are shorthand for a default `Queue` and are rejected beside an
`otlpQueue` they did not build. One `Queue` class, in memory or persisted through `storage`; a
second implementation needs a reason a `storage` cannot give. Valid while a queue owns the
transport.

## `colors` precedence, and colour on by default through 2.x

2026-09-17: `colors` precedence is code, then `NO_COLOR`, then `FORCE_COLOR`, then the default.
The default stays on through 2.x: a terminal is a new user's first sight of the library, and a
minor never changes output for a consumer whose env says nothing. Following the TTY is a 3.0.0
change; Rails' always-on `colorize_logging` is the precedent for what unconditional colour costs
log pipelines. Valid while text is the default format.

## `Log` and `Queue` each own a `clock`

2026-09-18: `Log` and `Queue` each own a `clock`, because each is usable without the other. A
`Log` passes its clock to the default `Queue` it builds; a `Queue` the consumer built keeps its
own, like its endpoint, since a `Log` must not mutate a queue it may share. Valid while a queue
is independently constructible.

## `Clock` hands back the platform's timer handle

2026-09-18: `Clock` is `{ now, setTimeout, clearTimeout }` with an exported `TimerHandle`, not a
`setTimeout` returning a cancel function. `unref` needs the real handle to keep a pending retry
from holding a Node or Deno process alive, and only the retry timer is unref'd; the `| number`
arm is what lets a browser, React Native or test clock type-check against types built with
`"types": ["node"]`. A clock that delegates to platform timers is unref'd like the system one;
only Deno's numeric `unrefTimer` is skipped for an injected clock, whose id may not be Deno's.
Serves README → Goals #7. Valid while a pending retry must not hold the process open.

## `clock` is a supported option

2026-09-18: `clock` is a supported option, not a test-only seam. Valid while a delegating clock
leaves process-exit behaviour intact.

## A required `Resolved*Conf` key is added in a minor and removed in a major

2026-09-18: adding a key to `ResolvedLogConf`/`ResolvedQueueConf`'s required half ships in a
minor; removing one, or making it optional, waits for a major, because a consumer reading that
key stops compiling. They are output types describing what the library produces; a consumer
hand-building one is writing a test double, not running existing code. Precedent: `colors` did
the same.

## This library's own warnings are written once per `stderr` sink

2026-09-18: a deprecation, or a setting this library cannot use, is written once per `stderr`
sink through the instance's formatter at `warn`, whatever `logLevel` is. Instances sharing the
default `console.error` share that one warning; a sink the caller injects gets its own, which
keeps a test independent of run order. A `warnOnce` message is literal: anything varying in it
breaks the once-only rule. An unknown `logLevel` is keyed on its raw value, so only the first
`enabled` call builds its text. Every such line opens with `@larvit/log: `, part of that literal,
so an app developer can tell which dependency emitted one about code they may not own. A
`Queue`'s `report` lines carry no prefix: they report that developer's own setup, not this
library's own API. Valid while this library writes its own warnings to a `stderr` sink.

## `otlpHttpBaseURI` userinfo becomes an `Authorization: Basic` header

2026-09-19: `otlpHttpBaseURI` userinfo is sent as an `Authorization: Basic` header, never in the
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

## `log.fetch` traces only `http:` and `https:` urls

2026-09-19: `log.fetch` traces only urls that resolve to `http:`/`https:`, the floor the queue's endpoint
already takes. A scheme written without `//` parses to an opaque path, where `URL.origin` is the
string `"null"` and the userinfo stays in `pathname`, so `url.full` cannot be rebuilt from the
parts without shipping what the url holds — credentials, or a whole `data:` payload. A `blob:`,
`data:` or `file:` read is a local one, not a network call worth a client span. It ships in a
minor rather than waiting for 3.0.0 because it is the security fix itself, and what it drops is
telemetry for urls nobody traces over the network: the timing and status of those spans were
right, their `url.full` (`nulluser:pass@host/x`, `https://example.comhttps://example.com/uuid`)
was not. Valid while `url.full` is built from `origin` + `pathname`.

## `log.fetch` passes url userinfo through, and `spanFailure` redacts it

2026-09-20: a `log.fetch` url carrying userinfo reaches the runtime's `fetch` untouched, and
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

## A captured value holding a credential records `REDACTED`

2026-09-20: a value `log.fetch` copies onto a span records `REDACTED` in place of the whole value
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

## Every rule on credentials in a span sits in one source section

2026-09-20: every rule deciding whether a credential reaches a span sits in one region,
`// --- Credentials on a span ---`, grouped by that question and not by the caller asking it, so
`traceableUrl` and `buildUrlFull` are there and not beside `log.fetch`. README → Goals #3 is
checkable only against the whole set, and the rules used to sit in two places ~800 lines apart
with the call running upward and no comment at either end naming the other. Neither the banner
nor this entry lists the routes in: prose has nothing keeping a count true, and the
userinfo-free-by-construction choices at the `log.fetch` call site are not rules this region
holds. Scoped to spans because the remaining credential rules are
the queue's, and the conf-redaction and Basic-over-`http:` items rewrite that code. Valid while
the source is a single `index.ts`.

## `format` is the formatter's one name, `entryFormatter` its alias until 3.0.0

2026-09-21: `format` is the formatter's one name, and `conf.entryFormatter` a deprecated alias of
it, read and write, until 3.0.0 drops both. `entryFormatter` is the same setting as `format`, winning over a
`"text"`/`"json"` one as 2.x documented, and two *different* formatters throw: nothing can hold
that combination yet, while rejecting the documented one would break a minor. The alias stays
because v2.3.0 filled `conf.entryFormatter` on every instance, whichever spelling set the
formatter; it is one module-level descriptor, because a closure pair per `Log` measured 1347
bytes against Goals #7's 1 KB, on `node:22-bookworm-slim` over 50 000 retained instances. Serves
README → Goals #5 for the one name, README → Goals #4 for the alias. Valid until 3.0.0 removes
`entryFormatter`.

2026-09-28, superseding the alias above on `log.conf`: `conf.format` keeps v2.3.0's read type, per
Goals #4: it never holds a function, and a string written beside `entryFormatter` reads back as
written. A function formatter reads back from `conf.entryFormatter` alone and wins over any
`conf.format`, as in v2.3.0, so writing `conf.format` on a function-formatted instance changes
nothing. Reading or writing `conf.entryFormatter` does not warn, since 2.x has no other spelling to
move to. Its `@deprecated` tag stays and names 3.0.0's `conf.format`, because Goals #4 deprecates
every 3.0.0 break in a minor first. A parent built by another copy of this module hands its child
only a function, its built-in formatters included, so writing that child's `conf.format` changes
nothing either.

## `ResolvedLogConf` keeps `entryFormatter` required

2026-09-21: `ResolvedLogConf` keeps `entryFormatter` in its required half while the property is
non-enumerable, so a spread's type promises a formatter the spread does not carry. Accepted
rather than fixed: v2.3.0 shipped the member required and a minor may not narrow it, per the
required-half entry above, and no type can say "non-enumerable". `todo.md`'s 3.0.0 item closes
it. Valid until 3.0.0 removes `entryFormatter`.

## `SENSITIVE_QUERY_KEYS` grows by name

2026-09-23: `SENSITIVE_QUERY_KEYS` grows by name, holding every key OTel semconv's default has
named: the four up to v1.41, which name no SigV4 key, and the five since v1.42, which add the SigV4
three and drop `AWSAccessKeyId` and `Signature`. Names, because a presigned url's credentials have
no shape that tells them from any other opaque value, and the semconv list is a default and not a
maximum, so more names break no spec. An access key id and a `GoogleAccessId` are identifiers, not
secrets, and are redacted anyway: semconv redacted `AWSAccessKeyId` for years, and a reader who
needs the key knows which bucket they fetched from. The rest of a presigned url is kept, because
`X-Amz-Date` and `X-Amz-Expires` are what README → Audience #3 reads to explain a 403.

2026-09-28, the maintainer: it adds `access_token`, RFC 6750's query spelling of a bearer token, and
`api_key`, `apikey`, `key` and `token`, the names the wild sends one under: turning `captureQuery`
on names no parameter, so Goal #3's "naming it is asking for it" does not cover them, and a false
hit costs the reader a value, never the key.

Serves README → Goals #3; over-redaction in a minor stands on the
2026-09-20 captured-value entry. Valid while the deny-list names query keys, not shapes.

## An unsampled `traceparent` drops the span, never the log records

2026-09-25, the maintainer: an incoming `traceparent` with the sampled flag off drops the span,
never the log records. OTel's stable logs spec defines no sampling; a record links to its trace
by id, so an unsampled request's `log.error` still reaches the log store. Serves README → Goals #2. Valid until OTel's trace-based log filtering is stable and on by
default.

## An empty `logLevel` logs at `info` and warns

2026-09-25, the maintainer: an empty `logLevel` (`""`, as compose's `${LOG_LEVEL}` substitutes
for an unset variable) is a value the caller wrote: it logs at `"info"` and
warns once, like any other unknown level, so the operator sees the empty substitution. Only
`undefined` means unset. Serves README → Goals #5. Valid while an unknown `logLevel` logs at the
default and warns.

## The default `Queue` lives in `conf.otlpQueue`

2026-09-27, the implementing agent: the default `Queue` a `Log` builds from the `otlp*` shorthand
lives in `conf.otlpQueue`, beside the shorthand it was built from. A `parentLog` is any `LogInt`,
whose `conf` holds every setting a child reads from it, so only there does the queue share
through a wrapper; and 3.0.0's plan makes `conf.otlpQueue` the one OTLP spelling, so moving it off
`conf` now would move it back then. Only a queue this library built may sit beside the
shorthand, and only beside exactly the shorthand it was built from; a queue the consumer built is
rejected beside any shorthand, even an identical one. It leaves `JSON.stringify(log.conf)`
circular, so `todo.md`'s item fixes that on the `Queue`, which stays readable on `conf`. Serves
README → Goals #6. Valid until 3.0.0 clears the shorthand from `conf`.

## A v2.3.0 copy's child loses a function formatter

2026-09-28, the maintainer: a child built by a library's own v2.3.0 copy under a 2.4.0 parent logs
default text when the parent has a function formatter, because v2.3.0 copies
`Object.keys(parentLog.conf)` and `conf.entryFormatter` is non-enumerable from 2.4.0. Accepted:
README → Goals #4 lets enumerability change in a minor, and making the alias enumerable again
hands it back to a spread of `log.conf` as an option the caller never wrote. Valid until 3.0.0
removes `entryFormatter`.

## The comprehension baseline

2026-09-27, the maintainer: the comprehension baseline is the 2026-09-27 four-seat panel at
depth 1 — 6/10 overall; Navigation 7, Locality 5.25, Shape 6, Self-sufficiency 6 — and a later
four-seat run at the same depth may not score lower. Comprehension work ships in the release it
is found in, ahead of that release's other items. Serves README → Goals #8. Valid until a later
run at or above 7.0 replaces the baseline.

## A stringified `Queue` carries its `conf`, less `storage` from 2.5.0

2026-09-28, the maintainer: `JSON.stringify` of a `Queue`, and so of `log.conf`, carries the queue's
`conf` and none of its working state — items, timers, scheduler — which is what made it circular.
From 2.5.0 `storage` is non-enumerable on `queue.conf`, so neither a stringify nor a spread carries
it: what it holds reaches nothing but the queue it restores, and a browser's `localStorage` holds
the origin's session tokens. That is data the app never handed this library as configuration; a
credential in `conf` is one the app wrote there itself. Credentials in that `conf` stringify as
written, as `log.conf`'s own `otlp*` keys beside a queue built from them already do: README → Goals
#3 stops at what this library emits, and redacting in a `toJSON` would be a second spelling of
3.0.0's item keeping credentials off `conf`. Serves README → Goals #3. Valid until 3.0.0 keeps
credentials off `log.conf` and `queue.conf`.

## A url nested in a request path is cut from where it starts

2026-09-28, the maintainer: where `url.full`'s path holds a url — raw, under any number of
percent-encoding layers, or base64 or base64url-encoded at any offset and alignment, percent-encoded
inside or not — the path is kept up to where that url, or the base64 group holding its start,
starts and the rest records `REDACTED`, the query with it whatever `captureQuery` says:
`https://proxy.test/fetch/REDACTED`. An `http:` or `https:` url is keyed on its scheme alone,
because its path and query — the latter parsing as the outer url's — can hold a signature or
`access_token` with no shape; not on `//` after it, since `https:\\u:p@host` and `https:u:p@host`
parse to the same credentials. Any other url is keyed on non-empty userinfo — after `ftp:` or
`ws(s):`, which parse like `https:`, or after a doubled slash — since a bare `word:` is a path's own
syntax (`/v1/p1:batchGet`), and a doubled slash is a sloppy join. Base64 is decoded one layer
deep, the layer a callback parameter carries; a url base64-encoded twice is exported as written,
since each further layer multiplies what every traced call pays (README → Goals #7) for a shape no
proxy is known to produce. Splicing `REDACTED@` covers the literal
spelling only, and replacing the whole path loses the endpoint README → Audience #3 reads. Valid
while `url.full` exports the request path. Serves README → Goals #3.

## An `Authorization` over plain `http:` warns once

2026-09-28, the maintainer: an `http:` `otlpHttpBaseURI` naming a host other than `localhost`,
`127.0.0.0/8` or `::1` writes one warning per `report` sink when it carries `user:pass@` or
`otlpAdditionalHeaders` sets `Authorization`, and still sends. The line names the host, never the
credential. Both spellings warn, so moving the credential never silences the exposure; refusing
would break the in-cluster `http:` collector, a deliberate and common setup. Serves README → Goals
#3's headline, "a credential never leaves", on the wire, without spending #4.

## `resolveFormatter` is exported

2026-09-28, the maintainer: the resolver from a conf to the `EntryFormatter` it writes with is
exported, so a library author handed a conf renders a line the way the instance does once 3.0.0
takes `conf.entryFormatter` away. Serves README → Goals #5 and Audience #2; an export is a minor
under #4.

## Both credential spellings stay, and their combination warns

2026-09-28, the maintainer: `user:pass@` in `otlpHttpBaseURI` and `otlpAdditionalHeaders: {
Authorization }` both stay: a vendor hands the endpoint over as one `https://id:token@host` string,
the only shape one env var carries, and a bearer token has no userinfo spelling. The two can
disagree, so setting both warns once per `report` sink in 2.x and throws in the constructor from
3.0.0, checked when the queue is built — a header added later is not rechecked; v2.4.0 documents the
header winning, so rejecting it sooner would spend README → Goals #4. Serves README → Goals #5.

## Inherited `otlpAdditionalHeaders` follow the endpoint's origin

2026-09-28: a child or clone naming its own `otlpHttpBaseURI` inherits `otlpAdditionalHeaders`
only from a source with no endpoint or one of the same origin, the line fetch draws when a redirect
drops `Authorization`; a new path on the same collector keeps working. Serves README → Goals #3's
headline, "a credential never leaves", on the wire.

## Only whitespace ends a url a status message quotes

2026-09-29, declined in review: a url found in a status message runs to the next whitespace, so a
redacted last value or fragment takes a closing quote, bracket or comma with it. A runtime or
wrapper quotes the url as written, where `"`, `<`, `>` and a backtick can be the url's own, and
stopping at one let the listed key after it through; a raw tab or newline in the url, which a parser
drops, ends it there too. Readability of the text around the url gives way to README → Goals #3 over
Audience #3. Valid while status messages are redacted in place.

## A nested url spelled with whitespace in its `//` is the caller's

2026-09-29, declined in review: a url nested in a query key or value has its listed keys redacted
only where it opens plainly, `http://`, `https://` or `//`; `http:/%09/a/?token=…` exports as
written, though a parser drops the tab. That is the spelling README → Goals #3 leaves to the
caller, and chasing every parser-equivalent spelling has no end. In a query key or value, userinfo
holding whitespace stays redacted, because there `+` or `%20` in a plainly written url decodes to
it; a captured header's raw space is the caller's, so a bot `user-agent` naming a host and an
address exports intact. Valid while Goals #3 exempts a url written other than plainly.

## Redacting a url nested in a query key may cost 2^8 passes

2026-09-29, declined in review: a url nested in a query key is redacted twice per level, its key
alone and then with its value, so a chain of eight such keys costs 256 passes over the url. The
depth cap bounds it, and README → Goals #3 outranks Goals #7. Valid while the depth cap stays at eight.
