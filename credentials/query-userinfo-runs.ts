import { decodings, inAnyDecoding, percentDecoded } from "./decodings.js";
import { holdsUserinfoInAnyDecoding, OPENS_USERINFO } from "./text.js";

const URL_DELIMITER = /[/?# ]/;

type QueryPairs = Array<[string, string]>;

// Whether a `//`, `\\`, `/\` or `\/` at the key's end, in any decoding, opens userinfo.
const opensUserinfo = (key: string) => inAnyDecoding(decodings(key), decoding => OPENS_USERINFO.test(decoding));

const holdsAtSignInAnyDecoding = (text: string) => inAnyDecoding(decodings(text), decoding => decoding.includes("@"));

// A run of pairs a parser reads as one userinfo: `start` is the pair that opened it. `end` is the
// last pair holding an `@` so far, and is absent while none does: such a run redacts no pair.
interface Run { end?: number, start: number }

// What one pair does to the scan: the runs it ends, and the run still going after it.
interface Scan { ended: Run[], going?: Run }

// `run` after the pair at `index`, read as `part`: a part's `@` before its first URL_DELIMITER ends in
// this pair, and that delimiter ends the run. A part with no delimiter leaves the run going.
function extendedRun(run: Run, part: string, index: number, holdsAtSign: (text: string) => boolean): Scan {
	const delimiterAt = part.search(URL_DELIMITER);
	const beforeDelimiter = delimiterAt < 0 ? part : part.slice(0, delimiterAt);
	const extended = holdsAtSign(beforeDelimiter) ? { ...run, end: index } : run;

	return delimiterAt < 0 ? { ended: [], going: extended } : { ended: [extended] };
}

// One pair's effect on the scan, given the run going before it. A pair can end the going run at its
// delimiter and open a new one, which its own value can end in turn.
function scanPair(going: Run | undefined, [key, value]: [string, string], index: number, holdsAtSign: (text: string) => boolean): Scan {
	const pair = `${key}=${value}`;
	const continued = going ? extendedRun(going, pair, index, holdsAtSign) : { ended: [] };

	if (continued.going || !opensUserinfo(key)) {
		return continued;
	}

	// The whole pair is tested for the new run's first `@`: extendedRun stops at the first delimiter, so it
	// misses the `//x@` in a value such as `ss//x@h`, which `?//u:p=ss%2F%2Fx@h` decodes to.
	const opened = extendedRun(holdsUserinfoInAnyDecoding(pair) ? { end: index, start: index } : { start: index }, value, index, holdsAtSign);

	return { ended: [...continued.ended, ...opened.ended], going: opened.going };
}

// A parser reads the `&` in `?//u:p&w@host` as part of the userinfo, which the query splits into
// two pairs. A key opening userinfo starts a run: its value and each later pair join it, up to the
// first URL_DELIMITER. The pairs from the run's start to its last `@` are redacted whole. Keep `\` out
// of URL_DELIMITER, since userinfo after `//` may hold one; a run that a backslash opens may then
// redact a pair holding no credential. A value opening userinfo is a url of its own, so
// `?next=https://h&q=a@b` is kept.
function pairsInUserinfoRuns(pairs: QueryPairs, holdsAtSign: (text: string) => boolean): Set<number> {
	const runs: Run[] = [];
	let going: Run | undefined;

	pairs.forEach((pair, index) => {
		const scan = scanPair(going, pair, index, holdsAtSign);

		runs.push(...scan.ended);
		going = scan.going;
	});

	// A run still going at the query's end ends there.
	const all = going ? [...runs, going] : runs;

	return new Set(all.flatMap(({ end, start }) => end === undefined ? [] : Array.from({ length: end - start + 1 }, (_, offset) => start + offset)));
}

// The indexes of the pairs inside a run of userinfo, in any of the three readings of the query that a
// consumer may use, as the query's raw pairs spell it. Dropping a reading no test tells apart can only
// let a credential through. Raw, only a literal delimiter ends a run and only a literal `@` counts: a
// `%2F` or `%40` there is no `/` or `@`. Percent-decoded, an escaped delimiter ends a run and an escaped
// `@` counts, for a consumer that decodes first; its `+` stays, since a parser takes it as part of the
// userinfo. Form-decoded, as `searchParams` reads it, a `+` is a space and ends a run.
export function pairsInUserinfoRunsOfAnyReading(rawPairs: QueryPairs, formDecodedPairs: QueryPairs): Set<number> {
	return new Set([
		...pairsInUserinfoRuns(rawPairs, text => text.includes("@")),
		...pairsInUserinfoRuns(rawPairs.map(([key, value]): [string, string] => [percentDecoded(key), percentDecoded(value)]), holdsAtSignInAnyDecoding),
		...pairsInUserinfoRuns(formDecodedPairs, holdsAtSignInAnyDecoding),
	]);
}
