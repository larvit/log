# Comprehension history

## 2026-11-10T19:39:17Z, PR #345 at bf3cc54, against 2300869

Ruling: better

| Seat | Navigation | Locality | Shape | Self-sufficiency | Overall |
|---|---|---|---|---|---|
| Mid A | better | better | better | better | better |
| Inherited architect | better | better | better | better | better |

Mid A, decided by:

- Shape, Navigation: `index.ts:1023` `redactedPath`: the base64 chain machinery and its six constants are gone, so the path cut is one read of each segment's percent-decoded levels
- Shape, Self-sufficiency: `index.ts:713` `MAX_PERCENT_LEVELS`: one overloaded MAX_URL_DEPTH became three named limits, and a typed UNREADABLE replaces an undefined each caller had to read as a credential
- Locality: `index.ts:1534` `Queue.retrying`: a set of the retried items, assigned in one place, replaces a front-of-queue count that three steps had to keep in order
- Navigation, Locality: `index.ts:704` `isCredentialHeaderName`: the header-name rule now sits in the credentials section instead of the sender section
- Shape: `index.ts:825` `holdsUserinfoAtAnyLevel`: the names say whether a check covers every decoded level, and `opensUserinfo` returns a plain boolean
- Self-sufficiency: `index.ts:122` `DEFAULT_LOG_LEVEL`: each default has one source instead of repeated literals
- Self-sufficiency: `index.ts:2265` `Log.fetch`: a comment says why settle is always set, and throwIfEnded replaces three copies of the ended check
- Self-sufficiency: `AGENTS.md:60` "Words": the glossary settles entry versus log record

Inherited architect, decided by:

- Navigation, Locality: `index.ts:704` "Credentials on a span": the header-name rule and the query-key rule now sit in one section, so a leaked url.full is chased in one place
- Shape, Locality, Navigation: `index.ts:1023` `redactedPath`: about 170 lines of base64 chain decoding, with a closure changing five outer variables, are gone; the cut fits on a screen
- Shape, Self-sufficiency: `index.ts:713` `MAX_PERCENT_LEVELS`: each limit is named for what it bounds, and the rule that a limit only redacts more is stated once
- Locality: `index.ts:1534` `retrying`: the trim is correct wherever the retried items sit, and no second function resets it
- Shape: `index.ts:825` `holdsUserinfoAtAnyLevel`: the names say which checks decode, and `opensUserinfo` is a yes-or-no check
- Locality, Self-sufficiency: `index.ts:123` `DEFAULT_LOG_LEVEL`: each default has one source
- Self-sufficiency: `index.ts:955` `redactQueryPair`: the caller's precondition is in the head comment
- Locality: `index.ts:2303` `throwIfEnded`: the ended guard is no longer copied three times

## 2026-11-10T20:52:06Z, PR #346 at cb63f44

| Seat | Navigation | Locality | Shape | Self-sufficiency | Overall |
|---|---|---|---|---|---|
| Junior A | 7 | 5.5 | 6 | 6 | 6 |
| Mid A | 7 | 5.5 | 6 | 6 | 6 |
| Maintainability senior | 7 | 5.5 | 6 | 6.5 | 6 |
| Inherited architect | 7 | 6 | 6 | 7 | 6.5 |
| Mean | 7.00 | 5.63 | 6.00 | 6.38 | 6.13 |

Junior A, hardest first:

- `index.ts:901` `redactedSearch`: three readings each run through `splitUserinfoPairs`, whose run state two closures mutate; which reading catches a shape stays opaque without tracing by hand
- `index.ts:959` `redactQueryPair`: recursion through `redactQueryPart` and `readQueryPart`, a depth counter, a memo keyed by a string, and five redact-or-keep exits
- `index.ts:1023` `redactedPath`: the loop bound is `cut`, which the loop itself lowers, and a whole-path fallback can discard the result
- `index.ts:198` `formatFunctions`: the formatter in use lives in a WeakMap keyed by the conf, set and read by five functions in two sections
- `index.ts:1206` `ExportScheduler.flush`: `running`, `pending` and `timer.retry` interact, and `next` re-enters `flush`
- `index.ts:656` `logWarningOfReport`: a Log-built queue's warnings route through a WeakMap keyed by a closure, across three sections
- `index.ts:1065` `failureMessage`: five redactors chained, and only the first one's order is explained
- `index.ts:1701` `Queue.countAndTrim`: who may drop what depends on `retrying`, which only `round` sets

Mid A, hardest first:

- `index.ts:901` `redactedSearch`: three readings, each split with a different predicate and joined, then recursed into; the comments name cases but not the invariant
- `index.ts:959` `redactQueryPair`: four ordered tiers, raw and decoded key and value side by side, and the depth limit checked here and in `readQueryPart`
- `index.ts:1023` `redactedPath`: `cut` set by one rule and lowered by a loop, each scheme-led tail decoded again, and a fallback that discards it all
- `index.ts:1065` `failureMessage`: four layered redactors whose order and division of labour the code doesn't say
- `index.ts:1968` `withDefaults`: deletes `conf.format` and installs a getter; the formatter's state spans five functions and a WeakMap keyed by object identity
- `index.ts:1835` `otlpKeysNotToInherit`: an inherited queue passes only while its headers object is reference-equal, and `resolveLogConf`'s step order matters
- `index.ts:1658` `Queue.warnOnce`: routes a warning by looking up its `report` in a WeakMap a `Log` filled
- `index.ts:801` `redactTextQueryKeys`: two global regexes' `lastIndex` and a `copied` cursor juggled in one loop

Maintainability senior, hardest first:

- `index.ts:840` `splitUserinfoPairs`: two `if`s on `start` can both run in one iteration once the closure `read` has called `close`
- `index.ts:959` `redactQueryPair`: a recursion cycle signalled only by two eslint-disable lines, a depth added in one place and checked in two, and an order of returns nothing marks as load-bearing
- `index.ts:1023` `redactedPath`: two cut rules share one variable that bounds the loop, and the loop starts at 1 with no comment
- `index.ts:1065` `failureMessage`: five transforms in a fixed order; whether swapping two of them leaks is unclear
- `index.ts:1887` `ENTRY_FORMATTER_ALIAS`: six functions in two sections cooperate on one hidden formatter state, told apart by a getter's identity
- `index.ts:1854` `defaultQueues`: queue identity in a WeakSet, its warnings in a WeakMap declared in another section, and a header reference-equality check
- `index.ts:1206` `ExportScheduler.flush`: three pieces of state and three paths, with `next` calling `flush` again; hard, but marked
- `index.ts:801` `redactTextQueryKeys`: the guard `opener.lastIndex > copied` carries a rule explained only by a dense comment

Inherited architect, would restructure first:

- `index.ts:704` "Credentials on a span": 385 lines and about 30 interlocking units with no sub-banners or entry-point list, and it also hosts the queue's header-name rule and `traceableUrl`
- `index.ts:921` `redactQueryPart`: three readings, eight decoding depths and a memo keyed `${depth} ${part}` must be held at once to explain why a shape slipped into `url.full`
- `index.ts:656` `logWarningOfReport`: a hidden WeakMap link between `buildDefaultQueue` and `Queue.warnOnce` carries a Log-built queue's warnings
- `index.ts:198` `formatFunctions`: a function formatter is never on `conf`; a side table and an accessor carry it, and a clone keeps it through `confFromOptions`
- `index.ts:726` `Levels`: "level" names log level, percent-decoding depth and url nesting
- `index.ts:1794` `OTLP_TRANSPORT_KEYS`: "transport" here means endpoint keys, and at `index.ts:1154` encodings, against the glossary's destination
- `index.ts:1532` `Queue.inflight`: differs only in case from `Log.inFlight`, which means un-awaited fetches
- `index.ts:1801` `INHERITED_BY`: the inheritance rule is spread across this table, `otlpKeysNotToInherit`, `sourceFormatFunction` and the skips in `inheritSettings`

## 2026-11-10T20:55:31Z, PR #346 rerun at cb63f44

| Seat | Navigation | Locality | Shape | Self-sufficiency | Overall |
|---|---|---|---|---|---|
| Junior A | 7 | 5.5 | 6 | 6 | 6 |
| Mid A | 7 | 5.5 | 6 | 6.5 | 6 |
| Maintainability senior | 7 | 5.5 | 6 | 6.5 | 6 |
| Inherited architect | 7 | 6 | 6 | 7 | 6.5 |
| Mean | 7.00 | 5.63 | 6.00 | 6.50 | 6.13 |

Junior A, hardest first:

- `index.ts:901` `redactedSearch`: five functions recurse into each other carrying a depth and a memo, over three readings unioned; the output for an input can't be predicted without tracing
- `index.ts:1023` `redactedPath`: two kinds of cut and a fallback that can discard both, with a loop bound that the loop itself changes
- `index.ts:1065` `failureMessage`: four redactions in a fixed order, and why that order is safe is only partly explained
- `index.ts:198` `formatFunctions`: the formatter lives in a WeakMap keyed by conf identity, copied, deleted and read back through six units whose order matters
- `index.ts:1206` `ExportScheduler.flush`: three fields, a timer cleared once `ready` settles, and re-entry through `next`
- `index.ts:1658` `Queue.warnOnce`: behaves differently when its `report` is a key in a WeakMap another section fills
- `index.ts:801` `redactTextQueryKeys`: two global regexes' `lastIndex` advanced by hand, and one comparison carries the already-redacted rule
- `index.ts:1701` `Queue.countAndTrim`: `retrying` is set only in `round` but read in the trim

Mid A, hardest first:

- `index.ts:840` `splitUserinfoPairs`: a state machine in two closure variables changed by two inner closures and a first-pair seed; its edges had to be traced by hand
- `index.ts:901` `redactedSearch`: three calls to `splitUserinfoPairs` and a recursion cycle visible only across four functions
- `index.ts:959` `redactQueryPair`: four ordered branches mixing decoded and raw key and value, with no map from a README rule to its branch
- `index.ts:1023` `redactedPath`: `cut` is both the loop bound and the result, reassigned inside the loop
- `index.ts:1917` `sourceFormatFunction`: the invariant that `conf.format` never holds a function and the WeakMap entry follows every conf copy is stated nowhere as one sentence
- `index.ts:1206` `ExportScheduler.flush`: what a third caller during a round gets needed tracing
- `index.ts:1864` `buildDefaultQueue`: a `Log` reaches its queue's warnings through two module-level registries
- `index.ts:2165` `tracedFetch`: its `error.type` differs from `Log.end`'s by one call, explained only by a pointer to semconv's rule

Maintainability senior, hardest first:

- `index.ts:840` `splitUserinfoPairs`: both blocks of the `forEach` run on the opening pair, `end` is set twice, and the name says split where it returns indices to redact
- `index.ts:959` `redactQueryPair`: four exits in an order that matters, in a recursion cycle marked only by two eslint-disable lines
- `index.ts:1023` `redactedPath`: two independent cuts and a fallback, the loop starting at 1 for a reason left implicit
- `index.ts:1065` `failureMessage`: a load-bearing order of four redactions, and `known` built by one redactor then partly overwritten by another
- `index.ts:801` `redactTextQueryKeys`: a hand scan with two global regexes whose invariants need three reads of the comment
- `index.ts:1887` `ENTRY_FORMATTER_ALIAS`: a getter and setter on a WeakMap, copied and deleted across five functions with no lifecycle stated in one place
- `index.ts:1854` `defaultQueues`: a queue the `Log` built is told by a WeakSet, field equality and header reference equality, and `Queue` doesn't say a `Log` reaches in
- `index.ts:726` `Levels`: means percent-decoding levels in a file whose other levels are log levels

Inherited architect, would restructure first:

- `index.ts:704` "Credentials on a span": about 30 declarations in 385 lines, recursing through a depth and a cache, with no map from a README rule to its function
- `index.ts:656` `logWarningOfReport`: a queue's warning routes through a WeakMap another section fills, the costliest correction to the map
- `index.ts:1968` `withDefaults`: deletes `conf.format`; the formatter is reached through four handles in three places
- `index.ts:1794` `OTLP_TRANSPORT_KEYS`: "transport" names endpoint options here, encodings at `index.ts:1154`, and a destination in the glossary
- `index.ts:698` `warnOnce`: keyed per stderr sink, while `Queue.warnOnce` is keyed per report function; one name, two rules
- `index.ts:2062` `childSpan`: makes only `log.fetch`'s client span, while `openSpan` makes child spans too
- `index.ts:1541` `Queue.unreadable`: a throwing `getItem` silently stops every storage write until the next start

## 2026-11-13T20:18:02Z, item-98 at 83091b4

| Seat | Navigation | Locality | Shape | Self-sufficiency | Overall |
|---|---|---|---|---|---|
| Junior A | 7 | 5.5 | 6 | 6 | 6 |
| Mid A | 7.5 | 6 | 6.5 | 6.5 | 6.5 |
| Maintainability senior | 8 | 6 | 6 | 7 | 6.5 |
| Inherited architect | 7.5 | 6 | 6 | 6.5 | 6.5 |
| Mean | 7.50 | 5.88 | 6.13 | 6.50 | 6.38 |

Junior A, hardest first:

- `index.ts:903` `redactedSearch`: three readings each run through `splitUserinfoPairs`, whose run state two closures mutate, then a four-function recursion with a depth and a shared cache; which pair an input ends up redacting stayed opaque
- `index.ts:961` `redactQueryPair`: five ordered checks over decoded and raw key and value side by side, and a rule whose order matters
- `index.ts:1025` `redactedPath`: two cut rules and a whole-path fallback, a loop bound that the loop lowers, and a start at 1 with no comment
- `index.ts:1947` `confFromOptions`: a clone's function formatter reaches it through a WeakMap written in `optionsFromSettings` and keyed by whichever object is in hand; four places held in mind at once
- `index.ts:1993` `inherited`: a skip set, a formatter rule, a per-key merge and a queue identity check by reference sit on top of the `INHERITED_BY` table
- `index.ts:803` `redactTextQueryKeys`: two regexes' `lastIndex` and a `copied` cursor, and a dense guard `opener.lastIndex > copied`
- `index.ts:1067` `failureMessage`: four stacked redactors whose order is explained only by README bullets
- `index.ts:1225` `ExportScheduler.flush`: `running`, `pending` and `timer.retry` plus a recursive `next`

Mid A, hardest first:

- `index.ts:842` `splitUserinfoPairs`: a state machine in `start` and `end` changed by two closures, and a stop rule resting on `URL_DELIMITER`; the three readings' union stayed half-opaque
- `index.ts:961` `redactQueryPair`: the four-function cycle through `redactQueryPart` and `readQueryPart`, marked only by two eslint-disable lines, with an order of checks only a comment states
- `index.ts:1025` `redactedPath`: `cut` set by one rule and then bounding the loop that lowers it, with a fallback that discards both
- `index.ts:1932` `ENTRY_FORMATTER_ALIAS`: the formatter is carried in seven names across a WeakMap and a getter-identity check, so a clone's function reaches the constructor invisibly
- `index.ts:1879` `otlpKeysNotToInherit`: a child keeps a default queue only while its headers object is the same reference as the conf's
- `index.ts:1225` `ExportScheduler.flush`: a comment about a bug already gone and three interacting fields
- `index.ts:1067` `failureMessage`: layered redaction whose order only the README bullets justify
- `index.ts:726` `Levels`: means percent-decoding depth beside `LogLevels`

Maintainability senior, hardest first:

- `index.ts:842` `splitUserinfoPairs`: two `if`s on `start` can both fire on one pair, and the name says split where it returns indices to redact
- `index.ts:961` `redactQueryPair`: a recursion cycle marked only by two eslint-disable lines and an order of checks nothing marks as load-bearing
- `index.ts:1025` `redactedPath`: `cut` bounds the loop it is lowered in, and the loop starts at 1 for an unstated reason
- `index.ts:1932` `ENTRY_FORMATTER_ALIAS`: a clone's formatter travels by a WeakMap entry keyed by the options object, and a getter's identity tells a conf this module built
- `index.ts:803` `redactTextQueryKeys`: the guard `opener.lastIndex > copied` carries a rule explained by a comment that lists cases, not the invariant
- `index.ts:1067` `failureMessage`: five stages in a fixed order, and which stage serves which runtime's message is unclear
- `index.ts:1879` `otlpKeysNotToInherit`: an invariant on reference equality that `inherited` must keep and nothing enforces
- `index.ts:1225` `ExportScheduler.flush`: three pieces of state and re-entry through `next`

Inherited architect, would restructure first:

- `index.ts:706` "Credentials on a span": about 30 units in 385 lines with no sub-banners or map from a README bullet to its function, five of them recursing into each other, and it also hosts the sender's header-name rule
- `index.ts:903` `redactedSearch`: three readings of one query and a recursive cycle held at once to say why a shape slipped into `url.full`
- `index.ts:202` `formatFunctions`: a module-level WeakMap keyed on confs and on options objects, written by `optionsFromSettings` and read by `confFromOptions`, so `clone()` passes a function through global state
- `index.ts:1837` `OTLP_TRANSPORT_KEYS`: "transport" names endpoint options here, encodings at `index.ts:1156`, and a destination in the glossary
- `index.ts:728` `Levels`: "level" names log level and percent-decoding depth in one file
- `index.ts:2256` `Log.inFlight`: differs only in case from `Queue.inflight` at `index.ts:1595` and means un-awaited fetches
- `index.ts:1723` `Queue.warnOnce`: shares a name with the module `warnOnce` at `index.ts:702` and keys on a different thing
- `index.ts:1835` "Resolving a Log's settings": about 20 functions and three module-level identity registries

## 2026-11-13T22:06:17Z, PR #360 at 238982e

| Seat | Navigation | Locality | Shape | Self-sufficiency | Overall |
|---|---|---|---|---|---|
| Junior A | 7 | 5.5 | 6 | 6 | 6 |
| Mid A | 7.5 | 6 | 6.5 | 6.5 | 6.5 |
| Maintainability senior | 7.5 | 6 | 6.5 | 6.5 | 6.5 |
| Inherited architect | 7.5 | 6 | 6.5 | 7 | 6.5 |
| Mean | 7.38 | 5.88 | 6.38 | 6.50 | 6.38 |

Junior A, hardest first:

- Overall, Self-sufficiency: `tracing/span-credentials.ts:282` `redactQueryPair`: a four-function recursion cycle with a depth cap and a memo, five checks whose order is load-bearing, and form-decoded and raw readings side by side; moving a check could not be shown safe
- Overall, Shape: `tracing/span-credentials.ts:151` `pairsInUserinfoRuns`: two closures change shared start and end, both `if`s can fire on one pair, and the caller runs it over three readings
- Locality, Overall: `log/settings.ts:147` `confFromOptions`: one formatter travels under six names through two WeakMaps and a getter-identity check across `settings.ts` and `entry-format.ts`
- Locality: `log/settings.ts:188` `copyKey`: must stay a plain assignment because `isDefaultQueueFor` compares headers by reference, a link only a comment states
- Shape: `tracing/span-credentials.ts:359` `redactedPath`: two cut indices, a loop bound that depends on one, and a whole-path fallback
- Overall: `otlp/export-scheduler.ts:44` `ExportScheduler.flush`: `running`, `pending` and `timer.retry` with a recursive `next`

Mid A, hardest first:

- Overall, Self-sufficiency: `tracing/span-credentials.ts:218` `redactedSearch`: three readings of one query feed a four-function recursive cycle; dropping one reading cannot be judged without the tests
- Overall: `tracing/span-credentials.ts:282` `redactQueryPair`: five ordered checks, and the comment states that the order matters but not why it suffices
- Locality, Overall: `log/settings.ts:169` `sourceFormatFunction`: a function formatter moves between `formatFunction`, `cloneFormatters`, `confFormatters` and an accessor, told apart by getter identity
- Locality: `log/settings.ts:88` `isDefaultQueueFor`: default-queue recognition rests on `otlpAdditionalHeaders` being the same reference, which `copyKey` has to keep
- Self-sufficiency: `tracing/fetch.ts:2` `warnOnceToStderr`: an import against the stated direction whose reason sits only in the decision log
- Overall: `otlp/export-scheduler.ts:44` `ExportScheduler.flush`: three interacting fields and re-entry through `next`

Maintainability senior, hardest first:

- Overall, Self-sufficiency: `tracing/span-credentials.ts:217` `redactedSearch`: a four-function cycle, three readings and five ordered steps held at once; a change fails open into an exported credential
- Locality, Overall: `log/settings.ts:135` `sourceFormatFunction`: formatter state in two identity-keyed WeakMaps across two files, with a getter comparison to tell a conf this copy built
- Locality: `log/settings.ts:66` `otlpKeysNotToInherit`: default-queue recognition rests on a reference check that a comment two functions away constrains
- Shape: `tracing/span-credentials.ts:359` `redactedPath`: three interacting cut indexes and a loop bound that changes with one
- Navigation, Self-sufficiency: `otlp/sender.ts:3` `isCredentialHeaderName`: an import against the stated direction with no note at the import
- Overall: `otlp/export-scheduler.ts:44` `ExportScheduler.flush`: `running`, `pending`, `timer.retry` and `ready`, re-entered from `next`

Inherited architect, would restructure first:

- Locality, Shape, Overall: `log/settings.ts:120` `ENTRY_FORMATTER_ALIAS`: nine concepts in one module, with the formatter alias split from `log/entry-format.ts:74` and kept apart by two WeakMaps
- Locality: `log/settings.ts:188` `copyKey`: a reference-identity constraint stated 100 lines from the rule that needs it
- Shape, Navigation: `otlp/sender.ts:3` `isCredentialHeaderName`: three imports run against the stated direction, none explained at its site
- Shape, Overall: `tracing/span-credentials.ts:213` the redaction cycle: 432 lines with a four-function recursion and three readings of each query, near the size where AGENTS says a module becomes a folder
- Navigation: `otlp/queue-items.ts:1` the queue's public types: found beside storage parsing and byte measurement, not in `queue.ts`

## 2026-11-13T22:09:10Z, PR #360 rerun at 238982e

| Seat | Navigation | Locality | Shape | Self-sufficiency | Overall |
|---|---|---|---|---|---|
| Junior A | 7 | 5 | 6 | 5.5 | 5.5 |
| Mid A | 7.5 | 6 | 7 | 6.5 | 6.5 |
| Maintainability senior | 7 | 6 | 6.5 | 6.5 | 6.5 |
| Inherited architect | 7.5 | 6.5 | 6.5 | 7 | 7 |
| Mean | 7.25 | 5.88 | 6.50 | 6.38 | 6.38 |

Junior A, hardest first:

- Overall, Self-sufficiency: `tracing/span-credentials.ts:282` `redactQueryPair`: five ordered checks inside a four-function cycle with a memo and a depth cap; reordering two could not be shown safe without the tests
- Overall, Shape: `tracing/span-credentials.ts:151` `pairsInUserinfoRuns`: two closures change shared start and end, both `if`s can fire on one pair, and the caller runs it over three readings
- Locality, Overall: `log/settings.ts:169` `sourceFormatFunction`: one formatter travels under six names through two WeakMaps and a getter-identity check across two files
- Locality: `log/settings.ts:188` `copyKey`: must stay a plain assignment because `isDefaultQueueFor` compares headers by reference
- Self-sufficiency: `tracing/fetch.ts:2` `warnOnceToStderr`: an import against the stated direction with no reason at the import
- Overall: `otlp/export-scheduler.ts:44` `ExportScheduler.flush`: `running`, `pending` and `timer.retry` interact

Mid A, hardest first:

- Overall, Self-sufficiency: `tracing/span-credentials.ts:282` `redactQueryPair`: five numbered checks, three readings and a depth memo held at once; the comment says the order matters but not why it suffices
- Locality, Overall: `log/settings.ts:143` `handedFormatFunction`: a function formatter travels through `cloneFormatters`, `confFormatters`, an accessor and `formatFunction`
- Locality: `log/settings.ts:88` `isDefaultQueueFor`: queue acceptance rests on the headers object being the same reference, guarded by a comment
- Self-sufficiency: `otlp/sender.ts:3` `isCredentialHeaderName`: an import against the stated direction explained only in the decision log
- Overall: `otlp/queue.ts:80` `Queue`: the constructor assigns `ready` before `scheduler`, an ordering nothing marks

Maintainability senior, hardest first:

- Overall, Self-sufficiency: `tracing/span-credentials.ts:217` the redaction cycle: check order and three readings are load-bearing, and by its own comment a green suite does not prove a change safe
- Overall, Shape: `tracing/span-credentials.ts:151` `pairsInUserinfoRuns`: closures change `start` and `end` out of sight, and the function runs three ways
- Locality, Overall: `log/settings.ts:169` `sourceFormatFunction`: the most hidden state in the project, in two side tables across two files
- Locality: `log/settings.ts:88` `isDefaultQueueFor`: the invariant lives in `copyKey` and breaks in another function
- Navigation, Shape: `tracing/span-credentials.ts:334` `pageHref`: a platform read in a module named for credential rules
- Self-sufficiency: `tracing/fetch.ts:1` the imports from `log/`: against the charter's direction, with no note at the import

Inherited architect, would restructure first:

- Shape, Overall: `tracing/span-credentials.ts:213` the redaction cycle: 432 lines and about 30 functions in a file that AGENTS says becomes a folder once it outgrows a module
- Shape, Self-sufficiency: `otlp/sender.ts:3` `isCredentialHeaderName`: three imports run against the declared layer order and none says why at its site
- Locality, Shape: `log/settings.ts:120` `ENTRY_FORMATTER_ALIAS`: formatter machinery in two files, under seven names
- Navigation: `otlp/queue-items.ts:7` `QueueConf`: the queue's public types sit under a name that says items
- Navigation: `primitives/failure-fields.ts:1` `failure-fields.ts`: wider than its name, field readers used on four paths
- Self-sufficiency: `log/entry-format.ts:23` the comment "A platform read sits at its caller": cites the decision log, and `processEnv` sits away from its caller

## 2026-11-13T22:59:24Z, PR #361 at 5d92ecc, against 5a8c1a9

Ruling: better

| Seat | Navigation | Locality | Shape | Self-sufficiency | Overall |
|---|---|---|---|---|---|
| Mid A | better | better | better | same | better |
| Inherited architect | better | better | better | same | better |

Mid A, decided by:

- Navigation, Shape: `credentials/span-values.ts:7` the credential-rule map: it names the file each rule lives in, and each file stays at or under 154 lines, where one 433-line module held every rule
- Locality, Shape: `otlp/queue-storage.ts:26` `StoredQueue`: storage state sits behind one class and an `items()` callback, where `Queue` mixed it with batching state
- Locality: `log/log.ts:43` `Log.constructor`: a clone's settings are passed directly, where a WeakMap keyed by the options object carried the formatter; the price is a hidden second parameter
- Navigation, Shape: `log/formatter-setting.ts:4` the formatter glossary: the glossary and every unit it names share one file, and `log/settings.ts` holds only inheritance and defaults
- Locality: `tracing/spans.ts:55` `endSpan`: one function ends a span from a typed `SpanFailure`, where `Log.end` and `tracedFetch` each did
- Locality: `credentials/query.ts:80` `PAIR_RULES`: the rule list encodes that the first rule to answer decides, and one reading object carries depth and memo through a three-function cycle

Inherited architect, decided by:

- Navigation, Shape, Overall: `credentials/span-values.ts:7` the credential-rule map: each rule names its file, the files import one way with no cycle, and a password in `url.full` leads to one file of 50 to 150 lines; reading one rule still jumps between `decodings.ts` and `text.ts`
- Locality, Overall: `log/log.ts:43` `Log.constructor`: `clone()` hands the settings straight to the constructor, where a module-level WeakMap moved a clone's formatter through hidden state; the cost is a public-looking second parameter
- Navigation, Locality: `log/formatter-setting.ts:4` the formatter glossary: formatter rules and the default queue each have a module named for them, where `settings.ts` mixed both with inheritance
- Shape, Locality: `credentials/query.ts:80` `PAIR_RULES`: an ordered table of rules whose comments say why the order matters, where five numbered checks carried two values through a four-function cycle
- Navigation, Shape: `otlp/queue-storage.ts:26` `StoredQueue`: dropped batches lead to `queue.ts` for the batch loop and `queue-storage.ts` for persistence; `restore` reaching a scheduler assigned later works only because the storage read is asynchronous, which a comment states
- Locality: `tracing/spans.ts:55` `endSpan`: one function sets the end time, the error status and `error.type`
- Locality: `log/console-output.ts:7` `writeConsoleEntry`: one function chooses the sink, where two console writers did
- Shape: `credentials/path.ts:13` `firstCredentialUrlSegment`: the scan is its own function and the cut one `const`

## 2026-11-14T14:19:33Z, item-135 at 78682e7

| Seat | Navigation | Locality | Shape | Self-sufficiency | Overall |
|---|---|---|---|---|---|
| Junior A | 7 | 5.5 | 6 | 6 | 6 |
| Mid A | 8 | 6.5 | 7 | 7 | 7 |
| Maintainability senior | 7 | 6 | 7 | 6.5 | 6.5 |
| Inherited architect | 7.5 | 6 | 6.5 | 7 | 6.5 |
| Mean | 7.38 | 6.00 | 6.63 | 6.63 | 6.50 |

Junior A, hardest first:

- Overall, Locality, Self-sufficiency: `credentials/query.ts:114` `redactedSearch`: a three-function cycle with a depth-keyed memo, three readings of one query and four order-sensitive rules; why rule 3 must precede rule 4 stays opaque
- Overall, Shape: `credentials/query-userinfo-runs.ts:26` `step`: a small state machine over `Run { lastAt, start }` with a `-1` sentinel, open and closed runs, and a special case tested first
- Locality, Shape: `log/formatter-setting.ts:48` `inheritedFormatter`: one formatter under five names in a WeakMap, told apart by getter identity
- Locality: `log/default-queue.ts:46` `isDefaultQueueFor`: recognition rests on a module-level WeakSet and the identity of the headers object, explained in one long paragraph
- Shape: `credentials/path.ts:36` `redactedPath`: two cut points, a skipped segment 0, and a whole-path fallback that can override the cut
- Overall: `otlp/export-scheduler.ts:43` `ExportScheduler.flush`: `running`, `pending` and `timer.retry` interact, and three calls had to be simulated by hand
- Navigation, Self-sufficiency: `tracing/fetch.ts:3` `warnOnceToStderr`: an import against the stated direction whose reason sits only in the decision log

Mid A, hardest first:

- Overall, Locality, Self-sufficiency: `credentials/query.ts:114` `redactedSearch`: a three-function cycle, a depth-keyed memo, three readings and order-sensitive pair rules, read only with README's credential bullets open beside it
- Overall, Shape: `credentials/query-userinfo-runs.ts:26` `step`: one pair can close a run and open another, and the comment's example had to be worked on paper
- Locality, Overall: `log/formatter-setting.ts:48` `inheritedFormatter`: "built by this copy of the library" is a getter-identity comparison, and the reason rests on pre-3.0.0 compatibility
- Locality: `log/default-queue.ts:46` `isDefaultQueueFor`: queue acceptance depends on a WeakSet and `===` of the headers object
- Shape: `credentials/path.ts:36` `redactedPath`: two candidate cuts, a url search bounded by the key's position and a whole-path fallback
- Overall: `otlp/export-scheduler.ts:44` `ExportScheduler.flush`: callers arriving mid-round join exactly one next round through `this.pending ??= this.running.then(next, next)`
- Self-sufficiency, Navigation: `tracing/fetch.ts:3` `warnOnceToStderr`: a runtime import from `log/` against AGENTS.md's direction, with no note at the import

Maintainability senior, hardest first:

- Overall, Locality, Self-sufficiency: `credentials/query.ts:80` `PAIR_RULES`: four ordered rules over three readings with a recursion through `readNestedUrl`; a wrong edit leaks a credential silently and the suite is the only oracle
- Overall, Shape: `credentials/query-userinfo-runs.ts:26` `step`: run state with a sentinel, run three times by `redactedSearch` with different decodings
- Locality, Shape: `log/formatter-setting.ts:48` `inheritedFormatter`: five names for one formatter, kept out of the conf in a WeakMap behind an accessor
- Locality: `log/default-queue.ts:46` `isDefaultQueueFor`: a consumer mutating `queue.conf.otlpAdditionalHeaders` changes whether a later child throws
- Locality: `log/settings.ts:75` `inherited`: `INHERITED_BY.entryFormatter` is empty yet a function formatter still reaches the child by a side path
- Shape: `credentials/path.ts:36` `redactedPath`: two interacting cut points and a whole-path fallback
- Overall: `otlp/export-scheduler.ts:44` `ExportScheduler.flush`: `running`, `pending`, `timer.retry` and `ready` interact
- Navigation, Self-sufficiency: `tracing/fetch.ts:3` `warnOnceToStderr`: imports from `log/` against the charter's direction, with no note at the import

Inherited architect, would restructure first:

- Locality, Shape, Overall: `log/formatter-setting.ts:48` `inheritedFormatter`: the `log/` conf pipeline is split four ways over `settings.ts`, `formatter-setting.ts`, `default-queue.ts` and `types.ts`, and a reader holds all four to answer what `log.conf` contains
- Overall, Shape, Self-sufficiency: `credentials/query-userinfo-runs.ts:26` `step`: its name does not say what it is, and it is understood only after `query.ts:114-132` and the README bullet
- Navigation, Shape: `tracing/fetch.ts:3` `warnOnceToStderr`: `tracing/` imports `log/` at three points, a value and two types, and nothing marks them as sanctioned
- Shape, Overall: `credentials/query.ts:114` `redactedSearch`: the raw, percent-decoded and form-decoded readings appear inline and again as `key`, `rawKey`, `rawValue` and `value`, with no name
- Navigation: `log/stderr-warnings.ts:25` `writeStderr`: the module name says warnings but it also writes error-level reports and holds a value printer
- Navigation: `credentials/span-values.ts:24` `traceableUrl`: it gates the scheme and redacts nothing, in a module of credential rules
- Navigation: `primitives/failure-fields.ts:2` `failure-fields.ts`: total field reads used by the sender, the storage and the span failure, under a name that says failure
- Overall: `otlp/export-scheduler.ts:44` `ExportScheduler.flush`: `running`/`pending` join with a retry timer that blocks new attempts
