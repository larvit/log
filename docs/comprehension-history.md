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
