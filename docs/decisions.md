# Decisions

## The OTLP types and `ResolvedLogConf` stay exported

2026-09-16, the maintainer: the OTLP types (`OtlpSpan`, `OtlpAttribute`, `OtlpLogPayload`,
`OtlpSpanPayload`) and `ResolvedLogConf` stay exported. `log.span` and `log.conf` are public, so
declaration emit requires the first two and the last; queue implementers need the payloads. Serves
README → Goals #4 and #6.

## No level-string shorthand from 3.0.0

2026-09-16, the maintainer: no level-string shorthand; `{ logLevel }` is the one spelling from
3.0.0. Serves README → Goals #5.

## The OTLP endpoint belongs to the queue

2026-09-16, the maintainer: the OTLP endpoint belongs to the queue. `otlpHttpBaseURI`,
`otlpProtocol` and `otlpAdditionalHeaders` on `Log` are shorthand for a default `Queue` and are
rejected beside an `otlpQueue` they did not build. One `Queue` class, in memory or persisted through
`storage`; a second implementation needs a reason a `storage` cannot give. Serves README → Goals #6.
Valid while a queue owns the transport.

## `colors` precedence, and colour on by default through 2.x

2026-09-17, the maintainer: `colors` precedence is code, then `NO_COLOR`, then `FORCE_COLOR`, then
the default. The default stays on through 2.x: a terminal is a new user's first sight of the
library, and a minor never changes output for a consumer whose env says nothing. Following the TTY
is a 3.0.0 change; Rails' always-on `colorize_logging` is the precedent for what unconditional
colour costs log pipelines. Serves README → Goals #4 and #5. Valid while text is the default format.

## `Log` and `Queue` each own a `clock`

2026-09-18, the implementing agent: `Log` and `Queue` each own a `clock`, because each is usable
without the other. A `Log` passes its clock to the default `Queue` it builds; a `Queue` the consumer
built keeps its own, like its endpoint, since a `Log` must not mutate a queue it may share. Serves
README → Goals #6. Valid while a queue is independently constructible.

## `Clock` hands back the platform's timer handle

2026-09-18, the implementing agent: `Clock` is `{ now, setTimeout, clearTimeout }` with an exported
`TimerHandle`, not a `setTimeout` returning a cancel function. `unref` needs the real handle to keep
a pending retry from holding a Node or Deno process alive, and only the retry timer is unref'd; the
`| number` arm is what lets a browser, React Native or test clock type-check against types built
with `"types": ["node"]`. A clock that delegates to platform timers is unref'd like the system one;
only Deno's numeric `unrefTimer` is skipped for an injected clock, whose id may not be Deno's.
Serves README → Goals #7. Valid while a pending retry must not hold the process open.

## `clock` is a supported option

2026-09-18, the implementing agent: `clock` is a supported option, not a test-only seam. Applies
the technical principle "Functional core, imperative shell". Valid while a delegating clock leaves
process-exit behaviour intact.

## A required `Resolved*Conf` key is added in a minor and removed in a major

2026-09-18, the implementing agent: adding a key to `ResolvedLogConf`/`ResolvedQueueConf`'s required
half ships in a minor; removing one, or making it optional, waits for a major, because a consumer
reading that key stops compiling. They are output types describing what the library produces; a
consumer hand-building one is writing a test double, not running existing code. Serves README →
Goals #4.

## This library's own warnings are written once per `stderr` sink

2026-09-18, the implementing agent: a deprecation, or a setting this library cannot use, is written
once per `stderr` sink through the instance's formatter at `warn`, whatever `logLevel` is. Instances
sharing the default `console.error` share that one warning; a sink the caller injects gets its own,
which keeps a test independent of run order. A `warnOnce` message is literal: anything varying in it
breaks the once-only rule. An unknown `logLevel` is keyed on its raw value, so only the first
`enabled` call builds its text. Every such line opens with `@larvit/log: `, part of that literal, so
an app developer can tell which dependency emitted one about code they may not own. A `Queue`'s
failure lines through `report` carry no prefix, since they report that developer's own setup; its
plain-`http:` `Authorization` warning is a warning, and keeps it. Serves README → Goals #5. Valid
while this library writes its own warnings to a `stderr` sink.

## `otlpHttpBaseURI` userinfo becomes an `Authorization: Basic` header

2026-09-19, the implementing agent: `otlpHttpBaseURI` userinfo is sent as an `Authorization: Basic`
header, never in the request url. WHATWG `fetch` refuses a url carrying credentials and quotes that
url into the `TypeError`, so keeping them there made basic auth unusable on Node and in browsers and
leaked them into the report line of every failed attempt. A `Queue` keeps its `Content-Type` and any
endpoint `Authorization` in one `Headers` and applies `otlpAdditionalHeaders` onto a copy per send,
so a name overrides by any casing where the object spread this replaced could not, a rotated token
reaches the next send, and a header the caller got wrong fails that export instead of the
construction of their `Log`. A colon in the user-id is passed through rather than rejected: RFC 7617
forbids it and a server splits on the first one, so there is no reading to salvage. Only `http:` and
`https:` are accepted, both because nothing else is fetchable and because any other scheme written
without `//` parses to an opaque path, where the userinfo stays in `pathname` and the
credential-free url cannot be built from its parts. `btoa` is assumed present beside `TextEncoder`,
on the same floor as the `TextEncoder` entry under `todo.md`'s "Kept as is": Hermes added both
(facebook/hermes#1178) and React Native has shipped them since 0.74. Both credential spellings stand
meanwhile: a collector vendor hands `user:pass@` over as one string, and dropping it in a minor
would break those consumers, so `todo.md` carries the question rather than this entry settling it.
Serves README → Goals #1 and #3. Valid while a queue owns the transport.

## `log.fetch` traces only `http:` and `https:` urls

2026-09-19, the implementing agent: `log.fetch` traces only urls that resolve to `http:`/`https:`,
the floor the queue's endpoint already takes. A scheme written without `//` parses to an opaque
path, where `URL.origin` is the string `"null"` and the userinfo stays in `pathname`, so `url.full`
cannot be rebuilt from the parts without shipping what the url holds — credentials, or a whole
`data:` payload. A `blob:`, `data:` or `file:` read is a local one, not a network call worth a
client span. It ships in a minor rather than waiting for 3.0.0 because it is the security fix
itself, and what it drops is telemetry for urls nobody traces over the network: the timing and
status of those spans were right, their `url.full` (`nulluser:pass@host/x`,
`https://example.comhttps://example.com/uuid`) was not. Serves README → Goals #2 and #3. Valid while
`url.full` is built from `origin` + `pathname`.

## `log.fetch` passes url userinfo through, and redacts it in its own span's status

2026-09-20 by the implementing agent, amended 2026-09-29 by the maintainer: a `log.fetch` url
carrying userinfo reaches the runtime's `fetch` untouched, and its span's status replaces that url,
as the runtime quotes it back, with its redacted form. A rejection forwarded to `end({ error })` is
read by "A header value or status message is redacted only where it is a url whole". Turning the
userinfo into an `Authorization: Basic` header, as `otlpHttpBaseURI` does with the same spelling, is
what README → Goals forbids of `log.fetch`: "The request differs from yours only by `traceparent`"
and "never a success the platform would have refused". The two spellings differ because the queue's
endpoint is this library's own request to make, where `log.fetch`'s is the caller's, so the same
string means "authenticate me" in one and "mirror what my runtime does with this" in the other.
React Native does put them on the wire, on one of its two platforms: `whatwg-fetch` hands the url to
`XMLHttpRequest.open` untouched and sets no header, iOS keeps the userinfo through `[RCTConvert
NSURL:]` and runs `NSURLSession` with no challenge delegate, so the system answers
`WWW-Authenticate` with the credentials, while Android passes the string to
`Request.Builder().url()` and OkHttp derives no `Authorization` from it — leaving the caller a 401,
and writing the userinfo out only in a plain-`http:` proxy's request line. Same at `v0.74.0` and at
`main` on 2026-09-20. Mirroring keeps that the platform's behaviour. It ships in a minor on the
precedent of the entry above, being the security fix itself. Serves README → Goals #1 and #3. Valid
while `log.fetch` is a drop-in for the runtime's `fetch`.

## A captured value holding a credential records `REDACTED`

2026-09-20 by the implementing agent, header names revised 2026-09-30 by the maintainer: a value
`log.fetch` copies onto a span records `REDACTED` where it holds a credential: a header value whole,
a query key or value whole where its url holds userinfo, and a listed key's value in place, per
README → Goals #3, "Credentials never leave". One rule for captured header values and for the query
values `captureQuery` keeps — and for a query key, since a url written as a bare key reaches
`url.full` the same way its value would — because the same credentialed url arrives by every one of
those routes and separate rules would disagree the way the two allow-lists used to. A header goes by
name where its name, ignoring case, matches Elastic APM's default `sanitize_field_names`
(`password`, `passwd`, `pwd`, `secret`, `*key`, `*token*`, `*session*`, `*credit*`, `*card*`,
`*auth*`, `set-cookie`, `*principal*`) or is `cookie`, the spec's optional addition
(https://github.com/elastic/apm/blob/main/specs/agents/sanitization.md), and everything else goes by
whether the value, parsed whole as a url, holds a credential. Elastic's is the one published
cross-agent spec that requires redacting request and response headers: OTel redacts no header value,
Datadog's tracers only in AppSec, and Datadog's eight exact names there miss `x-api-key` and every
`x-*-token`; the four RFC 9110 and RFC 6265 names 2.3.0 hard-coded missed them too. Redacting rather
than rejecting the allow-list entry is what a minor allows — README → Goals #4 deprecates a breaking
change in a 2.x minor first, and the leak is open now — and it matches the stance the query-key list
already took. `REDACTED` over dropping the attribute keeps the telemetry reader's "was the header
there?", so a false hit costs a value, never the header's presence. Valid while Elastic's default
list is the published one.

## Every rule on credentials in a span sits in one source section

2026-09-20, the implementing agent: every rule deciding whether a credential reaches a span sits in
one region, `// --- Credentials on a span ---`, grouped by that question and not by the caller
asking it, so `traceableUrl` and `buildUrlFull` are there and not beside `log.fetch`. README → Goals
#3 is checkable only against the whole set, and the rules used to sit in two places ~800 lines apart
with the call running upward and no comment at either end naming the other. Neither the banner nor
this entry lists the routes in: prose has nothing keeping a count true, and the
userinfo-free-by-construction choices at the `log.fetch` call site are not rules this region holds.
Scoped to spans because the remaining credential rules are the queue's, and the conf-redaction and
Basic-over-`http:` items rewrite that code. Serves README → Goals #3 and #8. Valid while the source
is a single `index.ts`.

## `format` is the formatter's one name, `entryFormatter` its alias until 3.0.0

2026-09-21, the implementing agent, on the maintainer's choice of `format`: `format` is the
formatter's one name, and `conf.entryFormatter` a deprecated alias of it, read and write, until
3.0.0 drops both. `entryFormatter` is the same setting as `format`, winning over a `"text"`/`"json"`
one as 2.x documented, and two *different* formatters throw: nothing can hold that combination yet,
while rejecting the documented one would break a minor. The alias stays because v2.3.0 filled
`conf.entryFormatter` on every instance, whichever spelling set the formatter; it is one
module-level descriptor, because a closure pair per `Log` measured 1347 bytes against Goals #7's 1
KB, on `node:22-bookworm-slim` over 50 000 retained instances. Serves README → Goals #5 for the one
name, README → Goals #4 for the alias. Valid until 3.0.0 removes `entryFormatter`.

2026-09-28, the maintainer, superseding the alias above on `log.conf`: `conf.format` keeps v2.3.0's
read type, per Goals #4: it never holds a function, and a string written beside `entryFormatter`
reads back as written. A function formatter reads back from `conf.entryFormatter` alone and wins
over any `conf.format`, as in v2.3.0, so writing `conf.format` on a function-formatted instance
changes nothing. Reading or writing `conf.entryFormatter` does not warn, since 2.x has no other
spelling to move to. Its `@deprecated` tag stays and names 3.0.0's `conf.format`, because Goals #4
deprecates every 3.0.0 break in a minor first. A parent built by another copy of this module hands
its child only a function, its built-in formatters included, so writing that child's `conf.format`
changes nothing either.

## `ResolvedLogConf` keeps `entryFormatter` required

2026-09-21, the implementing agent: `ResolvedLogConf` keeps `entryFormatter` in its required half
while the property is non-enumerable, so a spread's type promises a formatter the spread does not
carry. Accepted rather than fixed: v2.3.0 shipped the member required and a minor may not narrow it,
per the required-half entry above, and no type can say "non-enumerable". `todo.md`'s 3.0.0 item
closes it. Serves README → Goals #4. Valid until 3.0.0 removes `entryFormatter`.

## A query key is redacted by Datadog's suffix rule

2026-09-30, the maintainer, choosing from published defaults over names guessed one by one: a query
key records `REDACTED` when, ignoring case, `-` and `_`, it ends in a term of Datadog's default
query obfuscation (`DD_TRACE_OBFUSCATION_QUERY_STRING_REGEXP` as dd-trace-py documents it, whose
password terms take a trailing `1` or `2`), `key`, `credential` or `sig`, or is one of the names a
primary source documents a credential under in a url: Azure Functions' `code`, OIDC logout's
`id_token_hint`, GCS V2's `GoogleAccessId`. The names OTel semconv's default lists (main on
2026-09-30: `AWSAccessKeyId`, `Signature`, `sig`, `X-Amz-Credential`, `X-Amz-Security-Token`,
`X-Amz-Signature`, `X-Goog-Signature`) all match. Datadog's is the one widely deployed default built
for query keys; semconv's covers signed urls only, and Elastic, Sentry and Django skip the query or
redact every value. Semconv asks for case-sensitive matching, which only narrows its own list, so
matching more breaks no spec.

A false hit such as `oauth`, `bypass` or `design` costs the reader a value, never the key. The rest
of a presigned url is kept, because `X-Amz-Date` and `X-Amz-Expires` are what README → Audience #3
reads to explain a 403.

Serves README → Goals #3; over-redaction in a minor stands on the 2026-09-20 captured-value entry.
Valid while Datadog's default and semconv's list stay within these terms.

## An unsampled `traceparent` drops the span, never the log records

2026-09-25, the maintainer: an incoming `traceparent` with the sampled flag off drops the span,
never the log records. OTel's stable logs spec defines no sampling; a record links to its trace by
id, so an unsampled request's `log.error` still reaches the log store. Serves README → Goals #2.
Valid until OTel's trace-based log filtering is stable and on by default.

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

## An `Authorization` over plain `http:` warns once

2026-09-28, the maintainer: an `http:` `otlpHttpBaseURI` naming a host other than `localhost`,
`127.0.0.0/8` or `::1` warns when a send carries an `Authorization`, from `user:pass@` or
`otlpAdditionalHeaders`, and still sends. It is checked at each send, so a header set later warns
too, and written once per sink, host and source: through the Log's `stderr` at `warn` for a queue a
Log built, else the queue's `report`. The line names the host, never the credential. Both
spellings warn, so moving the credential never silences the exposure; refusing would break the
in-cluster `http:` collector, a deliberate and common setup. 2026-09-30, the maintainer: a `Queue`
given `acceptPlainHttpAuthorization: true` does not warn, the opt-out for a network the consumer
trusts; it sits on the queue alone, which owns the endpoint. Only `Authorization` is checked;
other credential headers are left as they are. Serves README → Goals #3's headline,
"Credentials never leave", on the wire, without spending #4. No expiry: the setups it serves are
not all known.

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

2026-09-28, the implementing agent: a child or clone naming its own `otlpHttpBaseURI` inherits
`otlpAdditionalHeaders` only from a source with no endpoint or one of the same origin, the line
fetch draws when a redirect drops `Authorization`; a new path on the same collector keeps working.
Serves README → Goals #3's headline, "Credentials never leave", on the wire.

## A header value or status message is redacted only where it is a url whole

2026-09-29, the maintainer: a captured header value or a span's status message is read as a url only
where the runtime's `URL` parses the whole of it, so 2.5.0 exports as written what v2.4.0 redacted:
a url among other text, a percent-encoded url in a header, and a url the runtime cannot parse, such
as a scheme-relative `//user:pass@host`. Six review rounds each found a new way a scanner for urls
in free text missed one — a delimiter, an escape the rewrite wrote, a scheme ending another — so the
scanner went. Goals #3 draws that line and outranks #4. Valid while Goals #3 reads so.
