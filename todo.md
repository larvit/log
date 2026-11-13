# todo

## Scoring

`Score = 10 * V / (R + S)`

`Bar = 0.5`

`Next ID = 136`

## Items

| ID | Release | Blocked by | Exempt | Item | L | E | I | R | S | Moves | Score |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 130 | 2.6.0 |  |  | **Let a reader follow how a `Log`'s formatter, default queue and once-only warnings pass between functions, without tracing module-level tables across sections.** | 3 | 1 | 2 | 4 | 5 | code health by 6 | 4.2 |
| 131 | 2.6.0 |  |  | **Let a reader check each query, path and text redaction routine in `// --- Credentials on a span ---` on one read: its state, its recursion and the order of its checks plain where they act.** | 2 | 2 | 4 | 6 | 5 | code health by 7 | 4.0 |
| 134 | 2.6.0 |  |  | **Lower the reading cost of the files a chunk reads most before its first commit.** | 2 | 2 | 1 | 3 | 4 | code health by 3 | 2.7 |
| 135 | 2.7.0 | 130, 131 | decision | **Reach the comprehension floor: score the project against 7.0, and while any score is under it, file items lifting the lowest dimension, with this item's successor.** | 1 | 1 | 1 | 1 | 1 | code health by 2 | 6.2 |
| 36 | 2.7.0 |  | principle | **Reach the retry decision and a `log.fetch` span's attributes without a network call.** | 2 | 1 | 1 | 2 | 5 | code health by 5 | 4.5 |
| 43 | 2.7.0 |  | principle | **Give `ExportScheduler` and save coalescing named states.** | 3 | 1 | 2 | 4 | 5 | code health by 6 | 4.2 |
| 48 | 2.7.0 |  | principle | **Test the untested failure paths.** | 2 | 1 | 1 | 2 | 4 | code health by 4 | 4.2 |
| 109 | 2.7.0 |  | principle | **Test without the wall clock: no sleep, no real timer and no time bound.** | 2 | 1 | 1 | 2 | 4 | code health by 4 | 4.2 |
| 110 | 2.7.0 |  | principle | **Register one test per case where a test loops over its cases or checks many behaviours.** | 1 | 1 | 1 | 1 | 4 | code health by 3 | 3.7 |
| 25 | 2.7.0 |  |  | **Publish the artifact the gate tested.** | 2 | 2 | 3 | 5 | 4 | code health by 5 | 3.5 |
| 118 | 2.7.0 |  | principle | **Bring `index.ts`'s `// --- Credentials on a span ---` section within about seven things per level, or record why it holds more.** | 2 | 1 | 4 | 5 | 4 | code health by 5 | 3.5 |
| 128 | 2.7.0 |  |  | **Give each part of the library a source module of its own, so a rule can be read and tested without the rest.** | 4 | 2 | 3 | 7 | 8 | code health by 8 | 3.3 |
| 82 | 2.7.0 |  |  | **Tell a browser consumer in README → Queue exports that the collector must answer a CORS preflight.** | 1 | 2 | 1 | 2 | 1 | 3 by 5 | 2.3 |
| 19 | 2.7.0 |  | defect | **Leave a `Request` untraced in `log.fetch`.** | 1 | 1 | 2 | 2 | 2 | 2.1 by 6 | 2.1 |
| 114 | 2.7.0 |  |  | **Move `package.json`'s build and test one-liners into named scripts, and let the OTLP test read its collector's port, image and container name from the environment, today's values as defaults.** | 1 | 1 | 1 | 1 | 2 | code health by 1 | 2.1 |
| 18 | 2.7.0 |  |  | **Export `LogEntry` as an alias of `EntryFormatterConf`, so the 3.0.0 rename has a spelling a consumer can move to first.** | 1 | 1 | 1 | 1 | 1 | 3 by 3 | 2.1 |
| 80 | 2.7.0 |  | principle | **Run the browser suite in WebKit and Firefox as well as Chromium.** | 2 | 1 | 1 | 2 | 3 | 2 by 7 | 2.1 |
| 96 | 2.7.0 | 18, 128 | owner | **Add a list of transports, each handed plain log entries it encodes itself, with console and OTLP as the two this library ships and uses by default.** | 4 | 2 | 3 | 7 | 8 | 1 by 7, 4 by 8 | 1.4 |
| 28 | 2.7.0 | 96 |  | **Export resource attributes beyond `service.name`.** | 2 | 1 | 2 | 3 | 3 | 1 by 7 | 1.8 |
| 117 | 2.7.0 |  |  | **Bring the built `index.js` within README → Footprint's 10 KB gzipped budget.** | 2 | 1 | 2 | 3 | 3 | 5 by 7 | 1.5 |
| 31 | 2.7.0 | 96 |  | **Set a log record's `flags` to the W3C trace flags.** | 1 | 1 | 2 | 2 | 2 | 1 by 4 | 1.5 |
| 88 | 2.7.0 |  |  | **Parse `traceparent` as W3C Trace Context does: ignore uppercase hex, and read a higher version by its first four fields.** | 1 | 1 | 1 | 1 | 2 | 1 by 3 | 1.5 |
| 26 | 2.7.0 |  |  | **Check the footprint budget in CI, so the numbers in README → Footprint fail a build instead of going stale.** | 2 | 1 | 1 | 2 | 5 | 5 by 8 | 1.5 |
| 112 | 2.7.0 |  |  | **Run the suite on Deno and Bun in CI.** | 2 | 1 | 1 | 2 | 3 | 2 by 5 | 1.5 |
| 27 | 2.7.0 |  |  | **Name a `log.fetch` span and its errors as HTTP semconv does.** | 2 | 1 | 3 | 4 | 3 | 1 by 6 | 1.3 |
| 107 | 2.7.0 |  | principle | **Run the suite on React Native's Hermes in CI.** | 3 | 1 | 1 | 3 | 5 | 2 by 7 | 1.3 |
| 30 | 2.7.0 |  |  | **Let a consumer sample by ratio.** | 3 | 2 | 2 | 5 | 5 | 1 by 5, 5 by 4 | 1.3 |
| 81 | 2.7.0 |  | principle | **Test export and `log.fetch` against a real server in a browser.** | 2 | 1 | 1 | 2 | 5 | 2.1 by 6 | 1.2 |
| 99 | 2.7.0 | 96 |  | **Honour a collector's `Retry-After` before retrying a batch.** | 2 | 1 | 2 | 3 | 2 | 1 by 4 | 1.2 |
| 86 | 2.7.0 | 96 |  | **Set `telemetry.sdk.language` to a semconv value, `nodejs` or `webjs`.** | 1 | 1 | 2 | 2 | 2 | 1 by 3 | 1.1 |
| 29 | 2.7.0 | 96 |  | **Export span events.** | 3 | 1 | 2 | 4 | 5 | 1 by 6 | 1.0 |
| 87 | 2.7.0 | 96 |  | **Report a protobuf export's `partialSuccess` as the JSON transport does.** | 2 | 1 | 2 | 3 | 4 | 1 by 4 | 0.9 |
| 108 | 2.7.0 |  | principle | **Keep two tabs of one web app sharing a `storage` key from sending a record twice or deleting each other's backlog.** | 3 | 2 | 2 | 5 | 5 | 2 by 5 | 0.7 |
| 16 | 2.8.0 |  |  | **Warn once when `format` is a string other than `"text"` or `"json"`.** | 1 | 1 | 1 | 1 | 1 | 3 by 5 | 3.5 |
| 41 | 2.8.0 |  | principle | **Warn once about a negative, zero or `NaN` numeric `QueueConf` option, and use the default.** | 1 | 1 | 1 | 1 | 2 | 3 by 5 | 2.3 |
| 20 | 2.8.0 |  |  | **Announce in the README and CHANGELOG that 3.0.0 gives a `log.fetch` span `end({ error })`'s `error.type`, so a query on `"20"` for an abort or `"fetch_error"` moves first.** | 1 | 1 | 1 | 1 | 1 | 3 by 3 | 2.1 |
| 23 | 2.8.0 |  |  | **Settle one marker for a CHANGELOG entry a consumer must act on, and record it in the `AGENTS.md` line beside `### Security`.** | 1 | 1 | 1 | 1 | 1 | 3 by 3 | 2.1 |
| 21 | 2.8.0 |  |  | **Announce in the README that 3.0.0 adds a metrics kind to `OtlpPayload`, so an `OtlpQueue` implementer handles one before it arrives.** | 1 | 1 | 1 | 1 | 1 | 4 by 3 | 2.0 |
| 15 | 2.8.0 |  |  | **Warn once when `colors` is unset, `process.stdout.isTTY` is false and neither `NO_COLOR` nor `FORCE_COLOR` is set, where 3.0.0 turns colour off.** | 1 | 1 | 1 | 1 | 2 | 3 by 4 | 1.8 |
| 17 | 2.8.0 |  |  | **Warn once when an instance with `otlpQueue` set or inherited leaves `spanName` unset.** | 1 | 1 | 1 | 1 | 2 | 3 by 4 | 1.8 |
| 22 | 2.8.0 |  |  | **Announce in the README and CHANGELOG that 3.0.0 stops `log.conf` and `queue.conf` handing back a credential, so a consumer reading one out of them moves to their own copy first.** | 1 | 2 | 1 | 2 | 1 | 3 by 3 | 1.4 |
| 24 | 2.8.0 |  |  | **Publish an `index.js.map` that maps the published `index.js`.** | 1 | 1 | 1 | 1 | 2 | 3 by 3 | 1.4 |
| 46 | 2.8.0 |  | principle | **Keep an injected `clock` or `stdout` that throws from escaping a level method.** | 1 | 1 | 2 | 2 | 2 | 3 by 4 | 1.4 |
| 50 | 2.8.0 |  | principle | **Match the level set and where this library's own lines go to `~/.claude/principles/logging.md`, or record why not.** | 1 | 1 | 1 | 1 | 2 | 3 by 3 | 1.4 |
| 14 | 2.8.0 |  |  | **Deprecate `parentLog` together with `traceparent`.** | 1 | 1 | 2 | 2 | 2 | 4 by 4 | 1.3 |
| 83 | 2.8.0 |  |  | **Measure a full persisted queue's save to `localStorage` on a low-end phone, and budget it in README → Footprint.** | 1 | 2 | 1 | 2 | 3 | 5 by 5 | 1.3 |
| 42 | 2.8.0 |  | defect | **Check each persisted or enqueued payload's shape, so one corrupt item never drops its batch.** | 2 | 1 | 2 | 3 | 3 | 2 by 4 | 1.0 |
| 40 | 2.8.0 |  | principle | **Make `queue.conf` read back what the queue sends with.** | 2 | 1 | 1 | 2 | 4 | 3 by 4 | 0.9 |
| 51 | 2.8.0 |  | principle | **Keep a retried export from duplicating log records, or record in `docs/decisions.md` why duplicates stand.** | 2 | 2 | 2 | 4 | 4 | 1 by 4 | 0.8 |
| 32 | 2.8.0 |  |  | **Propagate `tracestate`.** | 3 | 2 | 2 | 5 | 5 | 1 by 4 | 0.6 |
| 55 | 3.0.0 |  | principle | **Make `log.span` and `ended` read-only, and an open span carry no end time.** | 2 | 1 | 1 | 2 | 3 | code health by 4 | 5.0 |
| 57 | 3.0.0 |  |  | **Retry only what OTLP/HTTP calls retryable: 429, 502, 503 and 504.** | 1 | 1 | 2 | 2 | 2 | 1 by 5 | 1.9 |
| 61 | 3.0.0 |  | decision | **Remove the level-string shorthand from `Log` and `clone`.** | 1 | 1 | 2 | 2 | 1 | 3 by 4 | 1.8 |
| 64 | 3.0.0 | 16 |  | **Reject a `format` string other than `"text"` or `"json"` in the constructor.** | 1 | 1 | 2 | 2 | 1 | 3 by 4 | 1.8 |
| 67 | 3.0.0 |  |  | **Let per-call metadata win over `context` on a key collision.** | 1 | 1 | 2 | 2 | 1 | 3 by 4 | 1.8 |
| 76 | 3.0.0 |  | decision | **Reject `user:pass@` in `otlpHttpBaseURI` beside an `Authorization` in `otlpAdditionalHeaders`, in the constructor.** | 1 | 1 | 2 | 2 | 1 | 3 by 4 | 1.8 |
| 77 | 3.0.0 | 17 |  | **Require `spanName` whenever `otlpQueue` is set or inherited.** | 1 | 1 | 2 | 2 | 1 | 3 by 4 | 1.8 |
| 78 | 3.0.0 |  | decision | **Write `MIGRATION.md`: one entry per 3.0.0 item, with the 2.x spelling and the 3.0.0 spelling.** | 1 | 2 | 2 | 3 | 3 | 3 by 8 | 1.8 |
| 70 | 3.0.0 |  |  | **Stop a child inheriting `spanName`.** | 1 | 1 | 2 | 2 | 1 | 4 by 4 | 1.8 |
| 71 | 3.0.0 | 14 |  | **Allow `parentLog` with `traceparent`.** | 2 | 1 | 2 | 3 | 3 | 4 by 8 | 1.8 |
| 60 | 3.0.0 |  |  | **Make `LogInt` `Logger` plus its own members, `enabled`, `flush` and `sampled` required.** | 1 | 1 | 2 | 2 | 2 | 4 by 5 | 1.7 |
| 66 | 3.0.0 |  |  | **Attach a child's log records to its own span instead of the parent's.** | 2 | 1 | 2 | 3 | 2 | 4 by 6 | 1.6 |
| 52 | 3.0.0 |  |  | **Spell a redacted `url.full` the way OTel semconv asks: `https://REDACTED:REDACTED@host/x`.** | 1 | 1 | 2 | 2 | 2 | 1 by 4 | 1.5 |
| 59 | 3.0.0 | 20 |  | **Give a `log.fetch` span `end({ error })`'s `error.type`: a string `code`, else `name`, else `"_OTHER"`.** | 1 | 1 | 2 | 2 | 2 | 1 by 4 | 1.5 |
| 69 | 3.0.0 |  |  | **Export metadata as typed OTLP attribute values instead of coercing every one to `stringValue`.** | 2 | 1 | 3 | 4 | 3 | 1 by 7 | 1.5 |
| 53 | 3.0.0 |  |  | **Keep the auth scheme when an allow-listed `authorization` records `REDACTED`.** | 1 | 1 | 2 | 2 | 2 | 3 by 4 | 1.4 |
| 54 | 3.0.0 |  | principle | **Require `msTimestamp` in `EntryFormatterConf`, and have the built-in formatters return a value for an unknown level.** | 1 | 1 | 1 | 1 | 2 | 3 by 3 | 1.4 |
| 63 | 3.0.0 | 18 |  | **Rename `EntryFormatterConf` to `LogEntry`.** | 1 | 1 | 2 | 2 | 2 | 3 by 4 | 1.4 |
| 65 | 3.0.0 | 15 | decision | **Default `colors` to `process.stdout.isTTY` when neither `NO_COLOR` nor `FORCE_COLOR` is set.** | 2 | 1 | 2 | 3 | 2 | 3 by 5 | 1.4 |
| 72 | 3.0.0 |  |  | **Make nothing throw after `end()`.** | 2 | 1 | 2 | 3 | 4 | 3 by 6 | 1.2 |
| 68 | 3.0.0 |  |  | **Merge a child's `context` per key with the parent's, as `clone()` does.** | 2 | 1 | 2 | 3 | 3 | 4 by 5 | 1.1 |
| 97 | 3.0.0 | 96 | decision | **Keep every OTLP option, type and encoding inside the OTLP transport, so no other code knows OTLP.** | 4 | 2 | 3 | 7 | 8 | 1 by 5, 4 by 6 | 1.0 |
| 58 | 3.0.0 |  |  | **Give the redaction sentinel its own name — `REDACTED by @larvit/log` or similar.** | 1 | 1 | 2 | 2 | 2 | 3 by 3 | 1.0 |
| 62 | 3.0.0 |  | decision | **Remove `entryFormatter`, the option and the `conf` alias of `format` beside it.** | 2 | 1 | 2 | 3 | 3 | 3 by 4 | 0.9 |
| 56 | 3.0.0 | 21 | decision | **Export OTLP metrics from instruments that aggregate for the caller.** | 3 | 2 | 2 | 5 | 8 | 1 by 7 | 0.8 |
| 73 | 3.0.0 |  |  | **Send `traceparent` cross-origin only to urls the caller lists, or record why not.** | 2 | 2 | 3 | 5 | 3 | 2 by 4 | 0.7 |
| 75 | 3.0.0 | 22 | decision | **Keep credentials off `log.conf` and `queue.conf`.** | 2 | 1 | 2 | 3 | 3 | 3 by 3 | 0.7 |

## Details

### 130. Let a reader follow how a `Log`'s formatter, default queue and once-only warnings pass between functions, without tracing module-level tables across sections.

The 2026-11-13 comprehension run ranked these places hard for Locality: `formatFunctions`, a
module-level WeakMap keyed by confs and by options objects, written by `optionsFromSettings` and
read by `confFromOptions`, so a clone's function formatter reaches the constructor through it;
`ENTRY_FORMATTER_ALIAS`, whose getter's identity tells a conf this module built;
`sourceFormatFunction`, `inherited` and `withDefaults` on top of them; `warned` beside
`logWarningOfReport`; `defaultQueues`; and `otlpKeysNotToInherit`, where a child keeps a default
queue only while its headers object is the same reference as the conf's, an invariant `inherited`
must keep and nothing enforces. Understanding or changing one of these needs the others in mind,
and nothing states their lifecycle in one place. Make each of those places easier to read.

What must keep holding, from `docs/decisions.md`: `entryFormatter` stays a read and write alias
of `format`, a function formatter reads back from `conf.entryFormatter` alone, and the alias is one
module-level descriptor, not a closure pair per `Log`, for README → Footprint (decisions.md: "`format`
is the formatter's one name…", "`ResolvedLogConf` keeps `entryFormatter` required" and "A v2.3.0
copy's child loses a function formatter"); the default `Queue` lives in `conf.otlpQueue`; and each warning is
written once per `stderr` sink. Item 96 may later move the formatter and the queue into the console
and OTLP transports; this item doesn't wait for it.

### 131. Let a reader check each query, path and text redaction routine in `// --- Credentials on a span ---` on one read: its state, its recursion and the order of its checks plain where they act.

Every seat of the 2026-11-13 comprehension run ranked these places among the hardest, and a wrong
edit to one leaks a credential, against README → Goals #7: `redactedSearch` unions three readings
of one query; `redactQueryPair`, `redactQueryPart`, `readQueryPart` and `redactedSearch` recurse
in a four-function cycle marked only by two eslint-disable lines, with a depth, a memo keyed by a string, and five
ordered exits whose order is load-bearing and unmarked; in `redactedPath`, `cut` is both the loop
bound and the result, the loop starts at 1 for an unstated reason, and a fallback discards both;
`redactTextQueryKeys` steers by two global regexes' `lastIndex` and a `copied` cursor, behind a
guard whose comment lists cases instead of stating the invariant; `failureMessage` stacks
redactors in an order only README bullets justify; and in `splitUserinfoPairs` two `if`s on
`start` can both fire on one pair, and the name says split where it returns ranges to redact.
Make each of those places easier to read.

Item 118 takes the section's grouping and `splitUserinfoPairs`'s closures; item 128 its module.
What each routine records stays as it is: README → Audience lets only a major drop a shape that
records `REDACTED`, and the rules stay in one section, as `docs/decisions.md` → "Every rule on
credentials in a span sits in one source section" asks.

### 134. Lower the reading cost of the files a chunk reads most before its first commit.

The last 5 chunks read a median of 91574 new input tokens before their first commit; the 5 before
them read 52550. Over the last 5 chunks, the files read most, counting opens and searches, were
`index.ts` 97 times, `test.ts` 35, `README.md` 33, `todo.md` 20, `docs/decisions.md` 17,
`package.json` 11, `CHANGELOG.md` 5, `AGENTS.md` 4, `eslint.config.js` 3 and `tap.ts` 2. The
figures live in `docs/reading-cost.md`. Item 128 splits `index.ts` into modules; this item doesn't
wait for it.

### 135. Reach the comprehension floor: score the project against 7.0, and while any score is under it, file items lifting the lowest dimension, with this item's successor.

The 2026-11-13 run scored Navigation 7.5, Locality 5.88, Shape 6.13, Self-sufficiency 6.5, overall
6.38; items 130, 131, 132 and 133 take the places its seats named. Its tagline names the floor, so
its chunk runs the four-seat scoring run. Where a dimension or the overall stays under 7.0, file
items for the places the seats name, lowest dimension first, and a copy of this item blocked by
them. Where every score reaches 7.0, it doesn't file anything, and the run replaces the comprehension
baseline.

### 36. Reach the retry decision and a `log.fetch` span's attributes without a network call.

`OtlpSender.send` holds the plain-http warning, encoding, the send and the status decision in one
method, and `tracedFetch` builds and redacts attributes around the live call. Principle: Functional
core, imperative shell.

### 43. Give `ExportScheduler` and save coalescing named states.

`timer.retry`, `running`, `pending` and `failures`, and `dirty` with `saving`, combine into states
nobody named; the batch timer left behind mid-round is one of them. Principle: Always use explicit
state machines.

### 48. Test the untested failure paths.

An unencodable payload, the 3 s send abort, `unref`'s effect, the clock-shape rejection, a malformed
`%` in the endpoint password, stored JSON that is not a list, a throwing `removeItem`, retries on
408/429/500, `end()` twice, and a level method after `end()`. Principle: Most, if not all, code
should have automated tests.

### 109. Test without the wall clock: no sleep, no real timer and no time bound.

`log.fetch redacts a long query within 250 ms` asserts on `performance.now()`, `waitFor` polls with a
real `setTimeout`, one test sleeps 10 ms and one runs a real 20 ms retry timer. Principle: a test
neither sleeps nor asserts on the wall clock (`~/.claude/principles/technical-principles.md`).

### 110. Register one test per case where a test loops over its cases or checks many behaviours.

`tap.ts`'s `test()` can register one test per case, yet the redaction tables loop
inside one test, and one `deepEqual` covers a whole table, so a failure names no case. Principle:
one behaviour per test, named for it; no loops or branches in a test body, parametrize the cases
(`~/.claude/principles/technical-principles.md`).

### 25. Publish the artifact the gate tested.

`push.yaml` builds and tests `index.js` inside the container; `publish.yaml` builds a second one on
the runner and publishes that, so the thing consumers install is never the thing CI proved. Build
once, upload, publish that.

### 118. Bring `index.ts`'s `// --- Credentials on a span ---` section within about seven things per level, or record why it holds more.

The section holds over 30 flat top-level declarations, with no recorded reason and no name order
a reader could find them by. That crosses the limit of about seven things per level. The principle
asks for a grouping under names a reader can follow, or a recorded reason. The rules must stay in
one section, as `docs/decisions.md` → "Every rule on credentials in a span sits in one source
section" asks. Principle: `~/.claude/principles/technical-principles.md` → "About seven things per
level". Found by the principles audit of 2026-10-28. `splitUserinfoPairs` is hard to read too: its
closures `close` and `read` mutate `start`, `end` and `split`, more interacting values than four or
five. Found by the 2.5.0 principles audit.

### 128. Give each part of the library a source module of its own, so a rule can be read and tested without the rest.

`index.ts` is one module, and any of its sections can reach every module-level table. The pure
credential rules therefore have no seam of their own: each redaction test passes through `Log`,
`fetch`, the queue and the export, so item 96 would move all of them, and item 96's "no other code
knows OTLP" can't be enforced within one file. On 2026-11-10 the maintainer approved
adding a bundler so that the package still publishes one `index.js`; which bundler is part of this
item. The footprint budgets in README → Footprint (see item 117) must hold.

### 82. Tell a browser consumer in README → Queue exports that the collector must answer a CORS preflight.

Every cross-origin OTLP POST is preflighted for its `Content-Type`; without CORS on the collector
each batch fails as `Failed to fetch` and retries forever.

### 19. Leave a `Request` untraced in `log.fetch`.

A JS consumer passing one gets `String(request)` = `"[object Request]"`, which in a browser resolves
against `location.href` to an http(s) url: `log.fetch` then traces that invented url and fetches it
with `init` alone, dropping the request's own method, body and headers. The signature says `string |
URL`, so a TypeScript consumer cannot reach it.

### 114. Move `package.json`'s build and test one-liners into named scripts, and let the OTLP test read its collector's port, image and container name from the environment, today's values as defaults.

`build`, `build-tests`, `replace-version-string`, `test-browser`, `test-docker` and `test-otlp` chain
shell inside one JSON string. `scripts/run-otlp-tests.mjs` fixes port 4318, the image and the
container name, so two runs on one machine clash, and its `docker rm -f` removes the other run's
collector. Found by the technical principles audit on 2026-10-26.

### 80. Run the browser suite in WebKit and Firefox as well as Chromium.

`scripts/run-browser-tests.mjs` launches Chromium alone, though its Playwright image ships both.
WebKit is the only engine on an iPhone, and `failureMessage` has a Firefox branch the suite only
fakes. `~/.claude/principles/frontend.md` → broad device support.

### 96. Add a list of transports, each handed plain log entries it encodes itself, with console and OTLP as the two this library ships and uses by default.

Today a `Log` writes console output through `stdout` and `stderr`, and exports through one seam,
`otlpQueue`, that takes OTLP payloads. Serving README → Goals #1 and #4 means a consumer sends to
any set of destinations without a second library. Settled by the maintainer on 2026-10-26:

- Console output is a transport like any other.
- A transport is handed plain log entries, and encodes them itself, so writing a new one is easy and
  intuitive.
- The OTLP options, injecting the `fetch` the OTLP transport sends with among them, belong to the
  OTLP transport. That `fetch` was item 12: the queue reaches for the global `fetch`, so a React
  Native app that pins TLS or uses `expo/fetch` cannot route the exporter through it, and the suite
  swaps `globalThis.fetch`.

It ships in a 2.x minor only if it can be done cleanly under README → Goals #8: the existing options
keep working exactly as today, building the default list, and the ones it replaces are deprecated.
Otherwise it moves to 3.0.0, with the maintainer's approval. The decisions resting on "a queue owns
the transport" and "The OTLP endpoint belongs to the queue" are revised in the same change.

**Done only once the maintainer approves both** the transport configuration a consumer writes, and
examples of building a transport, each shown to them before the item is marked complete. The
spelling is benched with the README's audience before it is shown.

Let a transport skip a record kind it does not handle, so a new kind, such as item 56's metrics,
ships in a minor instead of waiting for a major.

Every seat of the 2026-10-03 comprehension run named `formatFunctions` and `defaultQueues`, two
module-level tables a reader must trace to know a `Log`'s formatter and queue. Where the console
and OTLP transports take those over, the formatter and the queue are read where they are used.

### 28. Export resource attributes beyond `service.name`.

`service.version` and `deployment.environment` are what the telemetry reader groups on in Grafana,
and the shape is a map on the resource we already build.

### 117. Bring the built `index.js` within README → Footprint's 10 KB gzipped budget.

README → Footprint budgets `index.js` at ≤10 KB gzipped for Goals #5. On 2026-11-10, during the
2.5.0 release review, the build was 11056 bytes: `npm run build` in the repo's container image, then
`gzip -9c index.js | wc -c`. The budget is broken, and nothing checks it. Whether to shrink the
build or re-state the budget is for this item to work out. Item 26 will check the budget in CI, and
that check will fail from its first run until this item lands. Found on 2026-10-28, at 10439 bytes.

### 31. Set a log record's `flags` to the W3C trace flags.

An unsampled request's records export without their span, and nothing on them tells the backend that
span will never arrive.

### 88. Parse `traceparent` as W3C Trace Context does: ignore uppercase hex, and read a higher version by its first four fields.

`parseTraceparent` lowercases its input and requires an exact length.

### 26. Check the footprint budget in CI, so the numbers in README → Footprint fail a build instead of going stale.

Bundle size is the easy half; the per-operation figures need a stable enough harness to not flake.

### 112. Run the suite on Deno and Bun in CI.

README → Runtimes says Deno and Bun meet the rule and are not in CI; CI proving more runtimes is Goals #2's signal. Found by the goals principles audit on 2026-10-26.

### 27. Name a `log.fetch` span and its errors as HTTP semconv does.

That is `{method}` alone without a url template, where today it is `{method} {host}`; an unknown
method as `_OTHER` with `http.request.method_original`; and `error.type` set to the status code on a
4xx or 5xx.

### 107. Run the suite on React Native's Hermes in CI.

README → Audience calls React Native a primary target, but CI runs Node and Chromium only, so a break
under Hermes or React Native's own globals, such as a `URL` whose getters throw, ships unseen. Items 80 and 81 don't cover
it. `~/.claude/principles/frontend.md` → Testability and broad device support.

### 30. Let a consumer sample by ratio.

A fleet of phones on cellular has no way to cap what it sends, so the 1000-item queue bound is a
sampling decision made by accident. An incoming `traceparent` flag still wins where there is one.

### 81. Test export and `log.fetch` against a real server in a browser.

The browser run stubs `globalThis.fetch`, so the 64 KiB `keepalive` cap and the CORS preflight are
never exercised. Item 96 removes the global swap, not this gap. `~/.claude/principles/frontend.md` →
testability.

### 99. Honour a collector's `Retry-After` before retrying a batch.

OTLP/HTTP asks a client to wait as long as a 429 or 503 response's `Retry-After` says. Today the
queue retries on its own backoff, which can hit a throttling collector again too soon. It adds to
what the queue does, so it ships in a minor; it waits on item 96 because retries belong to the OTLP
transport.

### 86. Set `telemetry.sdk.language` to a semconv value, `nodejs` or `webjs`.

Today it is `"ecmascript"`, which a backend keying on the language does not recognise.

### 29. Export span events.

A reader expects to find the exception on an errored span, and the OTLP shape carries a
dropped-count we would owe them.

### 87. Report a protobuf export's `partialSuccess` as the JSON transport does.

Under `http/protobuf` a partially rejected batch counts as delivered.

### 108. Keep two tabs of one web app sharing a `storage` key from sending a record twice or deleting each other's backlog.

Every tab builds a `Queue` on the same `localStorage` key: each loads another tab's backlog at start,
then overwrites or removes the key on every change, so offline records go twice and a tab that drains
first deletes another's backlog. README's "one `Queue` per `key` per process" is advice a web app
cannot follow. `~/.claude/principles/frontend.md` → Prefer state in the URL first, backend second.

### 16. Warn once when `format` is a string other than `"text"` or `"json"`.

Today it falls back to text unsignalled: `new Log({ format: process.env.LOG_FORMAT })` logs text for
`"pretty"`.

### 41. Warn once about a negative, zero or `NaN` numeric `QueueConf` option, and use the default.

A negative `retryDelayMs` retries at once, `maxItems: 0` drops everything, a `NaN` `maxBatchBytes`
never flushes on size. Principle: Validate data and build DTOs as early as possible.

### 20. Announce in the README and CHANGELOG that 3.0.0 gives a `log.fetch` span `end({ error })`'s `error.type`, so a query on `"20"` for an abort or `"fetch_error"` moves first.

A numeric `code` gives way to `name` and the fallback becomes semconv's `"_OTHER"`.

### 23. Settle one marker for a CHANGELOG entry a consumer must act on, and record it in the `AGENTS.md` line beside `### Security`.

Two spellings exist: the `**Breaking:**` prefix `v2.0.0` uses, and the `### Security` grouping.
Neither covers a deprecation, so `entryFormatter` and the `new Log("debug")` shorthand tell a
consumer their code stops working in 3.0.0 from inside `### Everything else`, unmarked.

### 17. Warn once when an instance with `otlpQueue` set or inherited leaves `spanName` unset.

Item 77 makes the constructor reject it in 3.0.0, and this warning is that break's only notice.

### 24. Publish an `index.js.map` that maps the published `index.js`.

It describes tsc's output, which uglify then minifies and, since 2.5.0, mangles.

### 46. Keep an injected `clock` or `stdout` that throws from escaping a level method.

`log.fetch` guards the same failure; `log.info` lets it through to the app. Principle: Handle errors
explicitly, as values.

### 50. Match the level set and where this library's own lines go to `~/.claude/principles/logging.md`, or record why not.

It names five levels where this has six, `verbose` exports in `debug`'s severity band, the queue's
own failures log at `error` where the app still works, `error` and `warn` go to `stderr` where the
principle says OTLP or stdout, and nothing turns the console off beside OTLP. Principle:
`~/.claude/principles/logging.md`, levels and where each goes.

### 14. Deprecate `parentLog` together with `traceparent`.

Today `traceparent` is silently ignored.

### 83. Measure a full persisted queue's save to `localStorage` on a low-end phone, and budget it in README → Footprint.

Each save stringifies the whole queue, about 1.1 MiB when full, and `localStorage` writes
synchronously on the main thread.

### 42. Check each persisted or enqueued payload's shape, so one corrupt item never drops its batch.

`isOtlpPayload` checks the top-level array only; `mergePayloads` then throws and every valid record
merged with it is lost, on the offline phone path. Principle: Validate data and build DTOs as early
as possible.

### 40. Make `queue.conf` read back what the queue sends with.

A write to `otlpHttpBaseURI`, `otlpProtocol` or `acceptPlainHttpCredentials` doesn't change anything the
sender froze, and a replaced `storage` is saved to a store it was never loaded from. Principle:
Don't Repeat Yourself (two spellings that can disagree).

### 51. Keep a retried export from duplicating log records, or record in `docs/decisions.md` why duplicates stand.

A timeout or 5xx after the collector accepted a batch sends it again; spans dedupe by id, records do
not, and OTLP has no idempotency key. Principle: Idempotent data writing.

### 32. Propagate `tracestate`.

It is invisible when unused, and the W3C rules it must hold to — 512-char limit, list-member
ordering, the `ot` vendor key — are where the cost sits.

### 55. Make `log.span` and `ended` read-only, and an open span carry no end time.

Anyone handed a `LogInt` can rewrite what is exported, `log.ended = false` exports a span twice, and
an open span reads as a finished zero-length one. Principle: One owner per value.

### 57. Retry only what OTLP/HTTP calls retryable: 429, 502, 503 and 504.

Today 408, 500 and 501 retry too, and README → Queue exports documents that set, so narrowing it
waits for the major. Honouring `Retry-After` was split off as item 99, which ships in a minor.

### 67. Let per-call metadata win over `context` on a key collision.

The more specific value wins; today `context` wins.

### 76. Reject `user:pass@` in `otlpHttpBaseURI` beside an `Authorization` in `otlpAdditionalHeaders`, in the constructor.

2.5.0 warns first.

### 77. Require `spanName` whenever `otlpQueue` is set or inherited.

A child or clone of an OTLP-configured instance must name its span, and the constructor rejects one
that does not, so no backend shows `unnamed-span`.

### 78. Write `MIGRATION.md`: one entry per 3.0.0 item, with the 2.x spelling and the 3.0.0 spelling.

`entryFormatter` needs the pair case too: renaming the key beside a `format` string leaves two
`format` keys, and the last one wins.

### 70. Stop a child inheriting `spanName`.

Default to `"unnamed-span"` for both derivations.

### 71. Allow `parentLog` with `traceparent`.

Settings inherit from `parentLog`, the span nests under the upstream `traceparent`. This is the
request-handler case; today it silently loses the trace.

### 66. Attach a child's log records to its own span instead of the parent's.

OTel's rule is that a record carries the active span, and a child's `log.fetch` spans already nest
under it. No test asserts the old behaviour; write one for the new rule first.

### 52. Spell a redacted `url.full` the way OTel semconv asks: `https://REDACTED:REDACTED@host/x`.

Today the userinfo is dropped silently, so a span can carry `url.full` showing a credential-free url
beside a `status.message` quoting `http://REDACTED@host/x`, and the reader is told both that
credentials were written and that they were not. Only React Native reaches it; Node and browsers
refuse the url first. README → `log.fetch` in depth documents `url.full` as the url without its
userinfo, so per Goals #8 this waits for the major.

### 69. Export metadata as typed OTLP attribute values instead of coercing every one to `stringValue`.

Use `boolValue` for a boolean, `intValue` for a safe integer, `doubleValue` for any other number, so
OTLP carries what the JSON formatter already emits. Breaking because a backend that indexed these as
strings re-types the field, and queries and dashboards built on the string change with it.

### 53. Keep the auth scheme when an allow-listed `authorization` records `REDACTED`.

`Bearer REDACTED` and `Basic REDACTED` tell a reader chasing a 401 whether the caller sent the wrong
kind of credential, and RFC 9110's `auth-scheme` is a fixed token, never the secret. Split on the
first space and keep the prefix only where it matches the token grammar. README documents the value
as `REDACTED`, so per Goals #8 this waits for the major.

### 54. Require `msTimestamp` in `EntryFormatterConf`, and have the built-in formatters return a value for an unknown level.

Today they fall back to `Date.now()`, bypassing `clock`, and `msgTextFormatter` throws. Principle:
Functional core, imperative shell.

### 63. Rename `EntryFormatterConf` to `LogEntry`.

It is an entry, and the option it was named after is gone.

### 65. Default `colors` to `process.stdout.isTTY` when neither `NO_COLOR` nor `FORCE_COLOR` is set.

A browser, with no `process`, defaults to off. The TTY detection and its tests are in commit
9706b0a.

### 72. Make nothing throw after `end()`.

Level methods still write to the console and their OTLP records attach to the ended span, entering
the queue like any other record, so the queue's size/time flush exports them with no further call.
`end()` a second time resolves `{ err }`. Add `ended` to `LogInt`. `log.fetch` on an ended log sends
untraced, where today it throws synchronously, which the runtime's `fetch` never does.

### 68. Merge a child's `context` per key with the parent's, as `clone()` does.

Today a child's `context` replaces the parent's wholesale. Settle first which parent value merges: a
clone takes the live `log.context`, a child today reads `conf.context`, so they differ once
`log.context` is written to.

### 97. Keep every OTLP option, type and encoding inside the OTLP transport, so no other code knows OTLP.

The 3.0.0 half of item 96, removing what it deprecates: no part of the source outside the OTLP
transport knows or depends on anything OTLP. This takes over item 74's aim, one OTLP representation
in `conf`: today `log.conf.otlpHttpBaseURI` stays readable beside the `Queue` built from it, and
`isQueueFor` exists to match the two. Items naming `otlpQueue` or the `OtlpQueue` type, such as 17,
21, 56 and 77, are reworded to the transport shape once item 96 is approved.

### 58. Give the redaction sentinel its own name — `REDACTED by @larvit/log` or similar.

Today one token means three things to the telemetry reader: a header redacted by name, a value that
matched a credential shape, and a value the consumer's own app had already redacted upstream.
`REDACTED` shipped in 2.3.0 and README → Audience promises each documented span value, so renaming
it waits for the major.

### 62. Remove `entryFormatter`, the option and the `conf` alias of `format` beside it.

`format` is `"text" | "json" | ((entry) => string)`. This closes the one unsoundness 2.4.0 could
not: the alias is non-enumerable, so `ResolvedLogConf` declares a member a spread of a conf does not
carry.

### 56. Export OTLP metrics from instruments that aggregate for the caller.

The caller records measurements, and this library aggregates them and sends a metrics kind in
`OtlpPayload`, batched through `Queue` and POSTed to `/v1/metrics`. The decision "Metrics will come
with instruments that aggregate for the caller" says what aggregating covers. Collecting must never
hold a process open (Goals #9). It waits for the major because an `OtlpQueue` implementer receives
the wider union. Measure what the metrics messages and the instruments add against the 10 KB budget
before choosing which instruments ship.

### 73. Send `traceparent` cross-origin only to urls the caller lists, or record why not.

OTel's browser fetch instrumentation defaults that way (`propagateTraceHeaderCorsUrls`), because the
header preflights a cross-origin request; today `log.fetch` sends it everywhere, so narrowing it
changes a default.

### 75. Keep credentials off `log.conf` and `queue.conf`.

`otlpHttpBaseURI`'s `user:pass@` and an `otlpAdditionalHeaders` bearer token sit there verbatim, so
a consumer who logs their own conf puts them in their log store. Goals #7 stops at what this library
emits, so this is a Goals #8 break. Item 97 clears `log.conf`; `queue.conf` still needs redacting,
or its credentials held off it.
