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
