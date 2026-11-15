# todo

## Scoring

`Score = 10 * V / (R + S)`

`Bar = 0.5`

`Next ID = 165`

## Items

| ID | Release | Blocked by | Exempt | Item | L | E | I | R | S | Moves | Score |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 159 | 2.7.0 |  |  | **Let a reader state from one place what a child or clone of a `Log` inherits, without tracing four sources.** | 3 | 1 | 2 | 4 | 5 | code health by 8 | 5.6 |
| 160 | 2.7.0 |  |  | **Let a reader check by reading why a query key is redacted or kept, with every redaction 2.x makes still made.** | 3 | 2 | 4 | 7 | 5 | code health by 9 | 4.7 |
| 162 | 2.7.0 |  |  | **Make how a `Log` hands entries to its transports sit in folders and under names that say so.** | 3 | 1 | 2 | 4 | 4 | code health by 6 | 4.7 |
| 163 | 2.7.0 |  |  | **Let a reader check from the code and its comments when the export scheduler's shell re-enters `dispatch`, and what each re-entry reads.** | 3 | 1 | 2 | 4 | 4 | code health by 6 | 4.7 |
| 161 | 2.7.0 |  |  | **Make each function in `credentials/` sit in a file, and under a name, that says what it does.** | 2 | 2 | 4 | 6 | 4 | code health by 7 | 4.4 |
| 158 | 2.7.0 |  | principle | **Let a test hand a `Log` the network it sends through, so no test swaps `globalThis.fetch` except to prove a default reads it.** | 2 | 1 | 2 | 3 | 3 | code health by 3, 1 by 3 | 3.9 |
| 156 | 2.7.0 |  |  | **Lower the reading cost of the files a chunk reads most before its first commit.** | 2 | 2 | 1 | 3 | 4 | code health by 3 | 2.7 |
| 41 | 2.7.0 |  | principle | **Warn once about a negative, zero or `NaN` numeric `QueueConf` option, and use the default.** | 1 | 1 | 1 | 1 | 2 | 1 by 5 | 2.5 |
| 149 | 2.7.0 |  |  | **Keep a queue's storage read from rejecting when `restore` throws.** | 1 | 1 | 2 | 2 | 6 | code health by 3 | 2.3 |
| 23 | 2.7.0 |  |  | **Settle one marker for a CHANGELOG entry a consumer must act on, and record it in the `AGENTS.md` line beside `### Security`.** | 1 | 1 | 1 | 1 | 1 | 1 by 3 | 2.3 |
| 114 | 2.7.0 |  |  | **Move `package.json`'s build and test one-liners into named scripts, and let the OTLP test read its collector's port, image and container name from the environment, today's values as defaults.** | 1 | 1 | 1 | 1 | 2 | code health by 1 | 2.1 |
| 139 | 2.7.0 |  | principle | **Cite "Sane defaults" as applied in the clock and randomness decision, once the principle carries its exception for a library.** | 1 | 2 | 1 | 2 | 1 | code health by 1 | 2.1 |
| 19 | 2.7.0 |  | defect | **Leave a `Request` untraced in `log.fetch`.** | 1 | 1 | 2 | 2 | 2 | 3.1 by 6 | 2.1 |
| 15 | 2.7.0 |  |  | **Warn once when `colors` is unset, `process.stdout.isTTY` is false and neither `NO_COLOR` nor `FORCE_COLOR` is set, where 3.0.0 turns colour off.** | 1 | 1 | 1 | 1 | 2 | 1 by 4 | 2.0 |
| 17 | 2.7.0 |  |  | **Warn once when an instance with `otlpQueue` set or inherited leaves `spanName` unset.** | 1 | 1 | 1 | 1 | 2 | 1 by 4 | 2.0 |
| 80 | 2.7.0 |  | principle | **Run the browser suite in WebKit and Firefox as well as Chromium.** | 2 | 1 | 1 | 2 | 3 | 3 by 7 | 2.0 |
| 157 | 2.7.0 |  |  | **Hand a custom transport's `span` method a span in a consumer's shape, and each transport its own copy of an entry and a span.** | 3 | 2 | 3 | 6 | 5 | 1 by 4, 4 by 4 | 1.0 |
| 164 | 2.8.0 | 159, 160, 161, 162, 163 | owner | **Reach the comprehension floor: score the project against 7.0, and while any score is under it, file items lifting the lowest dimension, with this item's successor.** | 1 | 1 | 1 | 1 | 2 | code health by 3 | 6.2 |
| 28 | 2.8.0 |  |  | **Export resource attributes beyond `service.name`.** | 2 | 1 | 2 | 3 | 3 | 2 by 7 | 1.7 |
| 117 | 2.8.0 |  |  | **Bring the built `index.js` within README → Footprint's 10 KB gzipped budget.** | 2 | 1 | 2 | 3 | 3 | 5 by 7 | 1.5 |
| 26 | 2.8.0 |  |  | **Check the footprint budget in CI, so the numbers in README → Footprint fail a build instead of going stale.** | 2 | 1 | 1 | 2 | 5 | 5 by 8 | 1.5 |
| 88 | 2.8.0 |  |  | **Parse `traceparent` as W3C Trace Context does: ignore uppercase hex, and read a higher version by its first four fields.** | 1 | 1 | 1 | 1 | 2 | 2 by 3 | 1.5 |
| 31 | 2.8.0 |  |  | **Set a log record's `flags` to the W3C trace flags.** | 1 | 1 | 2 | 2 | 2 | 2 by 4 | 1.5 |
| 112 | 2.8.0 |  |  | **Run the suite on Deno and Bun in CI.** | 2 | 1 | 1 | 2 | 3 | 3 by 5 | 1.4 |
| 27 | 2.8.0 |  |  | **Name a `log.fetch` span and its errors as HTTP semconv does.** | 2 | 1 | 3 | 4 | 3 | 2 by 6 | 1.3 |
| 30 | 2.8.0 |  |  | **Let a consumer sample by ratio.** | 3 | 2 | 2 | 5 | 5 | 2 by 5, 5 by 4 | 1.3 |
| 107 | 2.8.0 |  | principle | **Run the suite on React Native's Hermes in CI.** | 3 | 1 | 1 | 3 | 5 | 3 by 7 | 1.2 |
| 81 | 2.8.0 |  | principle | **Test export and `log.fetch` against a real server in a browser.** | 2 | 1 | 1 | 2 | 5 | 3.1 by 6 | 1.2 |
| 99 | 2.8.0 |  |  | **Honour a collector's `Retry-After` before retrying a batch.** | 2 | 1 | 2 | 3 | 2 | 2 by 4 | 1.2 |
| 86 | 2.8.0 |  |  | **Set `telemetry.sdk.language` to a semconv value, `nodejs` or `webjs`.** | 1 | 1 | 2 | 2 | 2 | 2 by 3 | 1.1 |
| 29 | 2.8.0 |  |  | **Export span events.** | 3 | 1 | 2 | 4 | 5 | 2 by 6 | 1.0 |
| 87 | 2.8.0 |  |  | **Report a protobuf export's `partialSuccess` as the JSON transport does.** | 2 | 1 | 2 | 3 | 4 | 2 by 4 | 0.8 |
| 22 | 2.9.0 |  |  | **Announce in the README and CHANGELOG that 3.0.0 stops `log.conf` and `queue.conf` handing back a credential, so a consumer reading one out of them moves to their own copy first.** | 1 | 2 | 1 | 2 | 1 | 1 by 3 | 1.5 |
| 24 | 2.9.0 |  |  | **End the published `index.js` with a `sourceMappingURL` comment, so a runtime loads `index.js.map` unasked.** | 1 | 1 | 1 | 1 | 2 | 1 by 3 | 1.5 |
| 46 | 2.9.0 |  | principle | **Keep an injected `clock` or `stdout` that throws from escaping a level method.** | 1 | 1 | 2 | 2 | 2 | 1 by 4 | 1.5 |
| 50 | 2.9.0 |  | principle | **Match the level set and where this library's own lines go to `~/.claude/principles/logging.md`, or record why not.** | 1 | 1 | 1 | 1 | 2 | 1 by 3 | 1.5 |
| 14 | 2.9.0 |  |  | **Deprecate `parentLog` together with `traceparent`.** | 1 | 1 | 2 | 2 | 2 | 4 by 4 | 1.3 |
| 83 | 2.9.0 |  |  | **Measure a full persisted queue's save to `localStorage` on a low-end phone, and budget it in README → Footprint.** | 1 | 2 | 1 | 2 | 3 | 5 by 5 | 1.3 |
| 40 | 2.9.0 |  | principle | **Make `queue.conf` read back what the queue sends with.** | 2 | 1 | 1 | 2 | 4 | 1 by 4 | 1.0 |
| 42 | 2.9.0 |  | defect | **Check each persisted or enqueued payload's shape, so one corrupt item never drops its batch.** | 2 | 1 | 2 | 3 | 3 | 3 by 4 | 1.0 |
| 51 | 2.9.0 |  | principle | **Keep a retried export from duplicating log records, or record in `docs/decisions.md` why duplicates stand.** | 2 | 2 | 2 | 4 | 4 | 2 by 4 | 0.7 |
| 32 | 2.9.0 |  |  | **Propagate `tracestate`.** | 3 | 2 | 2 | 5 | 5 | 2 by 4 | 0.6 |
| 55 | 3.0.0 |  | principle | **Make `log.span` and `ended` read-only, and an open span carry no end time.** | 2 | 1 | 1 | 2 | 3 | code health by 4 | 5.0 |
| 142 | 3.0.0 |  | principle | **Take `cloneOf` off `Log`'s published constructor and `warn` off `Queue`'s.** | 2 | 1 | 2 | 3 | 3 | code health by 3 | 3.1 |
| 61 | 3.0.0 |  | decision | **Remove the level-string shorthand from `Log` and `clone`.** | 1 | 1 | 2 | 2 | 1 | 1 by 4 | 2.0 |
| 64 | 3.0.0 |  |  | **Reject a `format` string other than `"text"` or `"json"` in the constructor.** | 1 | 1 | 2 | 2 | 1 | 1 by 4 | 2.0 |
| 67 | 3.0.0 |  |  | **Let per-call metadata win over `context` on a key collision.** | 1 | 1 | 2 | 2 | 1 | 1 by 4 | 2.0 |
| 76 | 3.0.0 |  | decision | **Reject `user:pass@` in `otlpHttpBaseURI` beside an `Authorization` in `otlpAdditionalHeaders`, in the constructor.** | 1 | 1 | 2 | 2 | 1 | 1 by 4 | 2.0 |
| 77 | 3.0.0 | 17 |  | **Require `spanName` whenever `otlpQueue` is set or inherited.** | 1 | 1 | 2 | 2 | 1 | 1 by 4 | 2.0 |
| 78 | 3.0.0 |  | decision | **Write `MIGRATION.md`: one entry per 3.0.0 item, with the 2.x spelling and the 3.0.0 spelling.** | 1 | 2 | 2 | 3 | 3 | 1 by 8 | 2.0 |
| 57 | 3.0.0 |  |  | **Retry only what OTLP/HTTP calls retryable: 429, 502, 503 and 504.** | 1 | 1 | 2 | 2 | 2 | 2 by 5 | 1.8 |
| 70 | 3.0.0 |  |  | **Stop a child inheriting `spanName`.** | 1 | 1 | 2 | 2 | 1 | 4 by 4 | 1.8 |
| 71 | 3.0.0 | 14 |  | **Allow `parentLog` with `traceparent`.** | 2 | 1 | 2 | 3 | 3 | 4 by 8 | 1.8 |
| 60 | 3.0.0 |  |  | **Make `LogInt` `Logger` plus its own members, `enabled`, `flush` and `sampled` required.** | 1 | 1 | 2 | 2 | 2 | 4 by 5 | 1.7 |
| 66 | 3.0.0 |  |  | **Attach a child's log records to its own span instead of the parent's.** | 2 | 1 | 2 | 3 | 2 | 4 by 6 | 1.6 |
| 53 | 3.0.0 |  |  | **Keep the auth scheme when an allow-listed `authorization` records `REDACTED`.** | 1 | 1 | 2 | 2 | 2 | 1 by 4 | 1.5 |
| 54 | 3.0.0 |  | principle | **Require `msTimestamp` in `EntryFormatterConf`, and have the built-in formatters return a value for an unknown level.** | 1 | 1 | 1 | 1 | 2 | 1 by 3 | 1.5 |
| 63 | 3.0.0 |  |  | **Rename `EntryFormatterConf` to `LogEntry`.** | 1 | 1 | 2 | 2 | 2 | 1 by 4 | 1.5 |
| 65 | 3.0.0 | 15 | decision | **Default `colors` to `process.stdout.isTTY` when neither `NO_COLOR` nor `FORCE_COLOR` is set.** | 2 | 1 | 2 | 3 | 2 | 1 by 5 | 1.5 |
| 69 | 3.0.0 |  |  | **Export metadata as typed OTLP attribute values instead of coercing every one to `stringValue`.** | 2 | 1 | 3 | 4 | 3 | 2 by 7 | 1.5 |
| 52 | 3.0.0 |  |  | **Spell a redacted `url.full` the way OTel semconv asks: `https://REDACTED:REDACTED@host/x`.** | 1 | 1 | 2 | 2 | 2 | 2 by 4 | 1.5 |
| 59 | 3.0.0 |  |  | **Give a `log.fetch` span `end({ error })`'s `error.type`: a string `code`, else `name`, else `"_OTHER"`.** | 1 | 1 | 2 | 2 | 2 | 2 by 4 | 1.5 |
| 72 | 3.0.0 |  |  | **Make nothing throw after `end()`.** | 2 | 1 | 2 | 3 | 4 | 1 by 6 | 1.3 |
| 58 | 3.0.0 |  |  | **Give the redaction sentinel its own name — `REDACTED by @larvit/log` or similar.** | 1 | 1 | 2 | 2 | 2 | 1 by 3 | 1.1 |
| 68 | 3.0.0 |  |  | **Merge a child's `context` per key with the parent's, as `clone()` does.** | 2 | 1 | 2 | 3 | 3 | 4 by 5 | 1.1 |
| 97 | 3.0.0 |  | decision | **Keep every OTLP option, type and encoding inside the OTLP transport, so no other code knows OTLP.** | 4 | 2 | 3 | 7 | 8 | 2 by 5, 4 by 6 | 1.0 |
| 62 | 3.0.0 |  | decision | **Remove `entryFormatter`, the option and the `conf` alias of `format` beside it.** | 2 | 1 | 2 | 3 | 3 | 1 by 4 | 1.0 |
| 56 | 3.0.0 |  | decision | **Export OTLP metrics from instruments that aggregate for the caller.** | 3 | 2 | 2 | 5 | 8 | 2 by 7 | 0.8 |
| 75 | 3.0.0 | 22 | decision | **Keep credentials off `log.conf` and `queue.conf`.** | 2 | 1 | 2 | 3 | 3 | 1 by 3 | 0.8 |
| 73 | 3.0.0 |  |  | **Send `traceparent` cross-origin only to urls the caller lists, or record why not.** | 2 | 2 | 3 | 5 | 3 | 3 by 4 | 0.7 |
| 108 | 3.0.0 |  | principle | **Keep two tabs of one web app sharing a `storage` key from sending a record twice or deleting each other's backlog.** | 3 | 2 | 2 | 5 | 5 | 3 by 5 | 0.7 |

## Details

### 159. Let a reader state from one place what a child or clone of a `Log` inherits, without tracing four sources.

All four seats of the 2026-11-15 scoring run (PR #391, at 4f96af8) named `log/conf.ts:121`
`inherited`, and Locality, at 5.88, is the run's lowest dimension. No seat could predict what a
child inherits:

- `log/conf.ts:121` `inherited`: three skip rules, `otlpKeysNotToInherit`, `keysTransportsKeepOut`
  and the formatter pair, are unioned into one skip set, then applied in a fixed order within
  `resolveConf` that nothing explains. The architect found `source.conf.entryFormatter` may be a
  getter that answers with a built-in.
- `log/conf.ts:66` `ownConf` and `log/conf.ts:157` `withDefaults`: the formatter lives under two
  keys and is read through `functionFormatterOf` while every other key is read raw; the conf is
  mutated three more times after the defaults, and stays writable by the caller.
- `log/deprecated-options/formatter-alias.ts:14` `ENTRY_FORMATTER_ALIAS`: a non-enumerable accessor
  over a module `WeakMap`, with getter identity as provenance.

Make each of these places easier to read. Today's observable behaviour holds, under strict semver
(README → Audience): what a child and a clone inherit, `entryFormatter` included. The 2.x layer sits
where 3.0.0 can delete it: item 62 removes `entryFormatter` and item 97 the OTLP keys, and this item
leaves both removals to them.

Ranks ahead of the release's other items because docs/decisions.md → "The comprehension baseline"
ships comprehension work ahead of them; Moves reflects that the overall score is under the 7.0 floor.

### 160. Let a reader check by reading why a query key is redacted or kept, with every redaction 2.x makes still made.

The query-credential rules were the hardest place of the 2026-11-15 scoring run (PR #391, at
4f96af8) for every seat, under Overall and Locality, the run's lowest dimension at 5.88:

- `credentials/query.ts:47` `readNestedUrl`, `:78` `redactsKeyAndValue` and `:111`
  `redactedSearch`: a cycle of three or four functions with a depth-keyed memo. The depth rises
  only in `redactedSearch` while the cap is checked in two places, and a key is read alone and
  joined. Seats could not predict an output, nor say which condition covers which README bullet.
- `credentials/query-userinfo-runs.ts:34` `scanPair` and `:55` `pairsInUserinfoRuns`: a run is
  tracked across pairs under three readings of the query, and one pair can close a run and open
  another. Why a key that opens a run is checked against the whole pair stayed opaque, and a
  comment admits a special case. The senior warned that a local-looking change can open a gap that
  one reading would have caught.

Make each of these places easier to read. This is security-critical (README → Goals #7): every
redaction the suite and README → Credentials in a captured value promise still holds. A chunk
that reworks redaction has let defects escape before (item 84 drew six later fixes), so the chunk
adds a test for each shape the rework could drop before it changes the code.

Ranks ahead of the release's other items because docs/decisions.md → "The comprehension baseline"
ships comprehension work ahead of them; Moves reflects that the overall score is under the 7.0 floor.

### 162. Make how a `Log` hands entries to its transports sit in folders and under names that say so.

Seats of the 2026-11-15 scoring run (PR #391, at 4f96af8) found the transport code where its folder
or comment says something else, under Navigation (7.38) and Shape (6.63):

- `log/deprecated-options/default-transports.ts:9` `transportsOf`: live dispatch, which
  `opentelemetry-adapter/recorded-span.ts` imports, sits in the folder 3.0.0 cuts down (AGENTS.md →
  Working here). Two seats named it.
- `tracing/transport.ts:24` `Transport`: the contract for entries sits in the tracing folder.
- `log/console-output.ts:7` `writeConsoleEntry`: its comment calls it the one console writer, while
  `consoleTransport` writes on its own.

Done when each of these places sits where its name, folder and comment say, with imports still
running one way (AGENTS.md → Working here; the decision log names each import that runs against it).
What 3.0.0 deletes stays in `log/deprecated-options/`: item 97 removes the OTLP keys and
`inTransportNames`, and this item leaves them alone. Behaviour doesn't change.

Ranks ahead of the release's other items because docs/decisions.md → "The comprehension baseline"
ships comprehension work ahead of them; Moves reflects that the overall score is under the 7.0 floor.

### 163. Let a reader check from the code and its comments when the export scheduler's shell re-enters `dispatch`, and what each re-entry reads.

Seats of the 2026-11-15 scoring run (PR #391, at 4f96af8) found the pure `transition` of
`ExportScheduler` pleasant and its shell hard, under Overall (6.50) and Locality (5.88):

- `otlp/queue/export-scheduler.ts:181` `dispatch`: it re-enters itself from `startRound` and from its
  catch; `joined` is computed outside the state machine, read before the effects change `joiners`;
  and `Queue.round` calls `backoff()`, which recomputes, after dispatching.

Make this place easier to read. The 2.x behaviour, the order of rounds, retries and backoff, holds,
and so do its tests.

Ranks ahead of the release's other items because docs/decisions.md → "The comprehension baseline"
ships comprehension work ahead of them; Moves reflects that the overall score is under the 7.0 floor.

### 161. Make each function in `credentials/` sit in a file, and under a name, that says what it does.

Seats of the 2026-11-15 scoring run (PR #391, at 4f96af8) found names and files in `credentials/`
that mislead, under Shape (6.63) and Navigation (7.38):

- `credentials/span-values.ts:45` `failureMessage`, `:85` `redactedAsUrl` and `:103`
  `redactedRecordedValue`: a status-message redactor serves as the general redactor of recorded
  values, called on a value that is no failure, behind a made-up base url put on and taken off twice.
- `credentials/span-values.ts:25` `parseHttpUrl`: the filter for which urls `log.fetch` traces lives
  in the credentials folder.
- `credentials/text.ts:16` `isListedQueryKey`: the query-key rule sits in a file named for free text.

Done when each of these places sits where its name and file say, with imports still running one way
(AGENTS.md → Working here), and every rule on credentials in a span still in one folder (decision
"Every rule on credentials in a span sits in one folder"). Every redaction holds (README → Goals #7).
Item 160 reworks the query rules in `credentials/query*.ts`; this item leaves their logic to it.

Ranks ahead of the release's other items because docs/decisions.md → "The comprehension baseline"
ships comprehension work ahead of them; Moves reflects that the overall score is under the 7.0 floor.

### 158. Let a test hand a `Log` the network it sends through, so no test swaps `globalThis.fetch` except to prove a default reads it.

A `Log` takes `clock`, `randomBytes`, `stdout` and `stderr`, and `otlpTransport` and `Queue` take
`fetch`. The network is the one effect a `Log` can't be handed, in two places: `log/log.ts` →
`fetchTrace` sends every `log.fetch` request through `globalThis.fetch`, read at the call so a
polyfill installed later still wins, and `log/deprecated-options/default-queue.ts` →
`attachDefaultQueue` builds the queue for `otlpHttpBaseURI` with no `fetch`. So each test of those
two swaps the global through `tests/test-doubles.ts` → `stubFetch`. They
share one mutable global, a `log.fetch` test that forgets the swap sends a real request, and a
consumer testing their own code that calls `log.fetch` has to swap the global too.

Principle: "Functional core, imperative shell", which bans a test swapping `globalThis.fetch` by
name. Found by the principles pass of the 2.7.0 release review, round 2.

Done when the suite swaps `globalThis.fetch` only in a test that proves a default reads it, or
that code handed a `fetch` leaves the global alone, and the decision "A platform read stays a
default, and a consumer injects through `colors` and `clock`" lists `fetch` among those swaps. A `Log` that is handed nothing still sends through the global, polyfill included.

What bounds the repair:

- An option a consumer writes is a new spelling, so a panel seated as README → Audience picks it
  before it ships, and README → Goals #2 counts it against the documented surface.
- `Log`'s second constructor parameter carries only what this library passes
  (decision "A constructor parameter marked 'Not part of the API' carries what only this library
  passes"), so a test may not hand a `Log` its network through it.
- Item 97 removes the queue a `Log` builds, in 3.0.0. Until then that queue is in this item's
  scope.
- The comprehension seats found `attachDefaultQueue` hard to follow, since the two ways a queue is
  built report to different sinks. A change there makes that easier to read, not harder.

### 156. Lower the reading cost of the files a chunk reads most before its first commit.

`~/.claude/bin/reading-cost` reported `Rising:` at the 2.7.0 release review: the last 5 chunks' median is 72056 new input tokens before their first commit, the 5 before them 59661. `docs/reading-cost.md` holds the figures.

Read most over those 5 chunks (opens and searches): `README.md` 32, `docs/decisions.md` 10, `log/log.ts` 9, `otlp/payloads.ts` 9, `CHANGELOG.md` 8, `package.json` 7, `tests/otel-adapter.test.ts` 7, `todo.md` 6, `AGENTS.md` 5, `index.ts` 4.

The chunk that ships this runs `reading-cost --reset`.

### 41. Warn once about a negative, zero or `NaN` numeric `QueueConf` option, and use the default.

A negative `retryDelayMs` retries at once, `maxItems: 0` drops everything, a `NaN` `maxBatchBytes`
never flushes on size. Principle: Validate data and build DTOs as early as possible.

### 149. Keep a queue's storage read from rejecting when `restore` throws.

`StoredQueue.read` (`otlp/queue/queue-storage.ts`) calls `restore`, and `Queue.restore` calls `scheduler.schedule()`, which calls the clock's `setTimeout`. Nothing on that path catches a throw. So an injected clock whose `setTimeout` throws rejects `readable` and `loaded`. That leaves `void this.write(...)` as an unhandled rejection, and rejects every round's `ready`. `ExportScheduler`'s `roundDone` step already guards against such a clock. The prose pass on item 43's chunk found this; the path predates that chunk.

### 23. Settle one marker for a CHANGELOG entry a consumer must act on, and record it in the `AGENTS.md` line beside `### Security`.

Two spellings exist: the `**Breaking:**` prefix `v2.0.0` uses, and the `### Security` grouping.
Neither covers a deprecation, so `entryFormatter` and the `new Log("debug")` shorthand tell a
consumer their code stops working in 3.0.0 from inside `### Everything else`, unmarked.

### 114. Move `package.json`'s build and test one-liners into named scripts, and let the OTLP test read its collector's port, image and container name from the environment, today's values as defaults.

`build`, `build-tests`, `test-browser`, `test-node` and `test-otlp` chain
shell inside one JSON string. `e2e-tests/run-otlp-tests.mjs` fixes port 4318, the image and the
container name, so two runs on one machine clash, and its `docker rm -f` removes the other run's
collector. Found by the technical principles audit on 2026-10-26.

### 139. Cite "Sane defaults" as applied in the clock and randomness decision, once the principle carries its exception for a library.

`docs/decisions.md` → "A `Log` and a `Queue` default their clock, and a `Log` its randomness"
departs from the technical principle "Sane defaults", which still has a library ask for its clock
and randomness. The exception is planned where the technical principles are kept, outside this
repo. When it lands, reword the decision to cite the principle as applied, and finish this item.
Until then the code stays: README → Goals #1 and #2 need the defaults. Found by the principles pass
of 2.6.0's release review.

### 19. Leave a `Request` untraced in `log.fetch`.

A JS consumer passing one gets `String(request)` = `"[object Request]"`, which in a browser resolves
against `location.href` to an http(s) url: `log.fetch` then traces that invented url and fetches it
with `init` alone, dropping the request's own method, body and headers. The signature says `string |
URL`, so a TypeScript consumer cannot reach it.

### 17. Warn once when an instance with `otlpQueue` set or inherited leaves `spanName` unset.

Item 77 makes the constructor reject it in 3.0.0, and this warning is that break's only notice.

### 80. Run the browser suite in WebKit and Firefox as well as Chromium.

`scripts/run-browser-tests.mjs` launches Chromium alone, though its Playwright image ships both.
WebKit is the only engine on an iPhone, and `failureMessage` has a Firefox branch the suite only
fakes. `~/.claude/principles/frontend.md` → broad device support.

### 157. Hand a custom transport's `span` method a span in a consumer's shape, and each transport its own copy of an entry and a span.

Today `TransportSpan` is `{ attributes: Metadata, span: OtlpSpan }`, and README → Transports documents it. Nothing is published yet, so 2.7.0 can still change it. Three problems:

- A custom transport gets the OTLP wire form: nanosecond strings, numeric kind and status codes.
- The attributes travel twice. `span.attributes` is the wire list without `service.name`; `attributes` is the `Metadata`, which `buildSpanPayload` reads only to find `service.name`.
- After item 97 (3.0.0), only the OTLP transport knows OTLP, so the shape would break one major after it ships.

The maintainer chose, on 2026-11-15: give `TransportSpan` a consumer's shape in 2.7.0, and convert to `OtlpSpan` inside the OTLP transport. A shape such as `{ name, traceId, spanId, parentSpanId?, kind, startMs, endMs, status, attributes, serviceName? }` is a starting point. The shape is a spelling consumers read, so a panel seated as README → Audience picks it before it ships. The decision "A `Log` sends through a list of transports" and README → Transports follow the shape.

`Log.end` hands every transport the `Log`'s own `this.span` object, and `log/log.ts` → `Log`'s entry hand-off gives every transport one `entry` object, so a transport that writes to either changes what the next one gets. README → Transports only asks a transport to copy before changing. Hand each transport its own copy of both. The implementing agent chose a copy over a frozen object, since a frozen one fails at runtime in a transport that writes to it; the maintainer was told and did not object.

Once done, `Transport` and its types can move out of `tracing/transport.ts` to a file named for what they hold, since `TransportSpan` no longer imports `OtlpSpan`.

### 164. Reach the comprehension floor: score the project against 7.0, and while any score is under it, file items lifting the lowest dimension, with this item's successor.

The latest run, at 4f96af8 on 2026-11-15 (PR #391), scored Navigation 7.38, Locality 5.88, Shape
6.63, Self-sufficiency 6.63, overall 6.50. Locality is the lowest.

Items 159 (what a child or clone inherits), 160 (the query-credential rules) and 163 (the export
scheduler's shell) lift Locality and the overall. Items 161 (`credentials/` names) and 162 (where
the transport code sits) lift Shape and Navigation. Places the seats named that no item takes:
`log/otlp-transport.ts:14` `inTransportNames` and `log/log.ts:187` `deprecatedEntry`, which 3.0.0
deletes (item 97), and `credentials/path.ts:36` `redactedPath`.

This item's tagline names the floor, so its chunk runs the four-seat scoring run. Where a dimension
or the overall stays under 7.0, file items for the places the seats name, lowest dimension first,
and a copy of this item blocked by them. Where every score reaches 7.0, it doesn't file anything,
and the run replaces the comprehension baseline.

### 28. Export resource attributes beyond `service.name`.

`service.version` and `deployment.environment` are what the telemetry reader groups on in Grafana,
and the shape is a map on the resource we already build.

### 117. Bring the built `index.js` within README → Footprint's 10 KB gzipped budget.

README → Footprint budgets `index.js` at ≤10 KB gzipped for Goals #5. On 2026-11-10, during the
2.5.0 release review, the build was 11056 bytes: `npm run build` in the repo's container image, then
`gzip -9c index.js | wc -c`. The budget is broken, and nothing checks it. Whether to shrink the
build or re-state the budget is for this item to work out. Item 26 will check the budget in CI, and
that check will fail from its first run until this item lands. Found on 2026-10-28, at 10439 bytes.
On 2026-11-13 the bundled build was 11366 bytes, and 11668 after the release review of 2.6.0
split the credential, settings and queue modules. With `uglifyjs --toplevel` the 11366 became 10241. That flag
shortens every top-level name, keeping only the names consumers import. So `Log.name` and
`Queue.name`, which a debugger prints, are shortened too unless the build reserves them.
On 2026-11-15 `transports`, with `consoleTransport` and `otlpTransport`, took the build to 13638 bytes.
The maintainer approved merging `transports` over the budget the same day; this item brings the build
back under it.

### 26. Check the footprint budget in CI, so the numbers in README → Footprint fail a build instead of going stale.

Bundle size is the easy half; the per-operation figures need a stable enough harness to not flake.

### 88. Parse `traceparent` as W3C Trace Context does: ignore uppercase hex, and read a higher version by its first four fields.

`parseTraceparent` lowercases its input and requires an exact length.

### 31. Set a log record's `flags` to the W3C trace flags.

An unsampled request's records export without their span, and nothing on them tells the backend that
span will never arrive.

### 112. Run the suite on Deno and Bun in CI.

README → Runtimes says Deno and Bun meet the rule and are not in CI; CI proving more runtimes is Goals #3's signal. Found by the goals principles audit on 2026-10-26.

### 27. Name a `log.fetch` span and its errors as HTTP semconv does.

That is `{method}` alone without a url template, where today it is `{method} {host}`; an unknown
method as `_OTHER` with `http.request.method_original`; and `error.type` set to the status code on a
4xx or 5xx.

### 30. Let a consumer sample by ratio.

A fleet of phones on cellular has no way to cap what it sends, so the 1000-item queue bound is a
sampling decision made by accident. An incoming `traceparent` flag still wins where there is one.

### 107. Run the suite on React Native's Hermes in CI.

README → Audience calls React Native a primary target, but CI runs Node and Chromium only, so a break
under Hermes or React Native's own globals, such as a `URL` whose getters throw, ships unseen. Items 80 and 81 don't cover
it. `~/.claude/principles/frontend.md` → Testability and broad device support.

### 81. Test export and `log.fetch` against a real server in a browser.

The browser run stubs `globalThis.fetch`, so the 64 KiB `keepalive` cap and the CORS preflight are
never exercised. A `fetch` passed to `otlpTransport` lets a test skip the global swap, but does not close this gap. `~/.claude/principles/frontend.md` →
testability.

### 99. Honour a collector's `Retry-After` before retrying a batch.

OTLP/HTTP asks a client to wait as long as a 429 or 503 response's `Retry-After` says. Today the
queue retries on its own backoff, which can hit a throttling collector again too soon. It adds to
what the queue does, so it ships in a minor.

### 86. Set `telemetry.sdk.language` to a semconv value, `nodejs` or `webjs`.

Today it is `"ecmascript"`, which a backend keying on the language does not recognise.

### 29. Export span events.

A reader expects to find the exception on an errored span, and the OTLP shape carries a
dropped-count we would owe them.

### 87. Report a protobuf export's `partialSuccess` as the JSON transport does.

Under `http/protobuf` a partially rejected batch counts as delivered.

### 24. End the published `index.js` with a `sourceMappingURL` comment, so a runtime loads `index.js.map` unasked.

The map matches `index.js` since the module split of 2026-11-13, yet `index.js` doesn't name it, so
Node's `--enable-source-maps` and a browser's devtools don't load it. The comment adds about 40
bytes to a file over README → Footprint's budget (item 117).

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

### 40. Make `queue.conf` read back what the queue sends with.

A write to `otlpHttpBaseURI`, `otlpProtocol` or `acceptPlainHttpCredentials` doesn't change anything the
sender froze, and a replaced `storage` is saved to a store it was never loaded from. Principle:
Don't Repeat Yourself (two spellings that can disagree).

### 42. Check each persisted or enqueued payload's shape, so one corrupt item never drops its batch.

`isOtlpPayload` checks the top-level array only; `mergePayloads` then throws and every valid record
merged with it is lost, on the offline phone path. Principle: Validate data and build DTOs as early
as possible.

### 51. Keep a retried export from duplicating log records, or record in `docs/decisions.md` why duplicates stand.

A timeout or 5xx after the collector accepted a batch sends it again; spans dedupe by id, records do
not, and OTLP has no idempotency key. Principle: Idempotent data writing.

### 32. Propagate `tracestate`.

It is invisible when unused, and the W3C rules it must hold to — 512-char limit, list-member
ordering, the `ot` vendor key — are where the cost sits.

### 55. Make `log.span` and `ended` read-only, and an open span carry no end time.

Anyone handed a `LogInt` can rewrite what is exported, `log.ended = false` exports a span twice, and
an open span reads as a finished zero-length one. Principle: One owner per value.

### 142. Take `cloneOf` off `Log`'s published constructor and `warn` off `Queue`'s.

Each is a second constructor parameter only this library passes, marked "Not part of the API" in
its JSDoc: `clone()` hands `Log` the `Log` it clones, and a `Log` hands the queue it builds the
function that writes its warnings. A consumer can still pass either, and `cloneOf` silently turns
`new Log` into a clone. Removing a parameter from a published signature needs a major. Against the
technical principles "Make invalid states unrepresentable" and "Explicit over implicit". Found by
the principles pass of 2.6.0's release review.

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

### 57. Retry only what OTLP/HTTP calls retryable: 429, 502, 503 and 504.

Today 408, 500 and 501 retry too, and README → Queue exports documents that set, so narrowing it
waits for the major. Honouring `Retry-After` was split off as item 99, which ships in a minor.

### 70. Stop a child inheriting `spanName`.

Default to `"unnamed-span"` for both derivations.

### 71. Allow `parentLog` with `traceparent`.

Settings inherit from `parentLog`, the span nests under the upstream `traceparent`. This is the
request-handler case; today it silently loses the trace.

### 66. Attach a child's log records to its own span instead of the parent's.

OTel's rule is that a record carries the active span, and a child's `log.fetch` spans already nest
under it. No test asserts the old behaviour; write one for the new rule first.

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

### 69. Export metadata as typed OTLP attribute values instead of coercing every one to `stringValue`.

Use `boolValue` for a boolean, `intValue` for a safe integer, `doubleValue` for any other number, so
OTLP carries what the JSON formatter already emits. Breaking because a backend that indexed these as
strings re-types the field, and queries and dashboards built on the string change with it.

### 52. Spell a redacted `url.full` the way OTel semconv asks: `https://REDACTED:REDACTED@host/x`.

Today the userinfo is dropped silently, so a span can carry `url.full` showing a credential-free url
beside a `status.message` quoting `http://REDACTED@host/x`, and the reader is told both that
credentials were written and that they were not. Only React Native reaches it; Node and browsers
refuse the url first. README → `log.fetch` in depth documents `url.full` as the url without its
userinfo, so per Goals #8 this waits for the major.

### 72. Make nothing throw after `end()`.

Level methods still write to the console and their OTLP records attach to the ended span, entering
the queue like any other record, so the queue's size/time flush exports them with no further call.
`end()` a second time resolves `{ err }`. Add `ended` to `LogInt`. `log.fetch` on an ended log sends
untraced, where today it throws synchronously, which the runtime's `fetch` never does.

### 58. Give the redaction sentinel its own name — `REDACTED by @larvit/log` or similar.

Today one token means three things to the telemetry reader: a header redacted by name, a value that
matched a credential shape, and a value the consumer's own app had already redacted upstream.
`REDACTED` shipped in 2.3.0 and README → Audience promises each documented span value, so renaming
it waits for the major.

### 68. Merge a child's `context` per key with the parent's, as `clone()` does.

Today a child's `context` replaces the parent's wholesale. Settle first which parent value merges: a
clone takes the live `log.context`, a child today reads `conf.context`, so they differ once
`log.context` is written to.

### 97. Keep every OTLP option, type and encoding inside the OTLP transport, so no other code knows OTLP.

The 3.0.0 half of `transports`, removing what 2.7.0 deprecates: no part of the source outside the OTLP
transport knows or depends on anything OTLP. This takes over item 74's aim, one OTLP representation
in `conf`: today `log.conf.otlpHttpBaseURI` stays readable beside the `Queue` built from it, and
`isQueueFor` exists to match the two. Items naming `otlpQueue` or the `OtlpQueue` type, such as 17,
21, 56 and 77, still say so and are reworded to the transport shape when each is planned.

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

### 75. Keep credentials off `log.conf` and `queue.conf`.

`otlpHttpBaseURI`'s `user:pass@` and an `otlpAdditionalHeaders` bearer token sit there verbatim, so
a consumer who logs their own conf puts them in their log store. Goals #7 stops at what this library
emits, so this is a Goals #8 break. Item 97 clears `log.conf`; `queue.conf` still needs redacting,
or its credentials held off it.

### 73. Send `traceparent` cross-origin only to urls the caller lists, or record why not.

OTel's browser fetch instrumentation defaults that way (`propagateTraceHeaderCorsUrls`), because the
header preflights a cross-origin request; today `log.fetch` sends it everywhere, so narrowing it
changes a default.

### 108. Keep two tabs of one web app sharing a `storage` key from sending a record twice or deleting each other's backlog.

Every tab builds a `Queue` on the same `localStorage` key: each loads another tab's backlog at start,
then overwrites or removes the key on every change, so offline records go twice and a tab that drains
first deletes another's backlog. README's "one `Queue` per `key` per process" is advice a web app
cannot follow. `~/.claude/principles/frontend.md` → Prefer state in the URL first, backend second.
