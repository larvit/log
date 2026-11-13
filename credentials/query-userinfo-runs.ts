import { decodings, inAnyDecoding } from "./decodings.js";
import { holdsUserinfoInAnyDecoding, OPENS_USERINFO } from "./text.js";

const URL_DELIMITER = /[/?# ]/;

// Whether a `//`, `\\`, `/\` or `\/` at the key's end, in any decoding, opens userinfo.
const opensUserinfo = (key: string) => inAnyDecoding(decodings(key), decoding => OPENS_USERINFO.test(decoding));

export const holdsAtSignInAnyDecoding = (text: string) => inAnyDecoding(decodings(text), decoding => decoding.includes("@"));

// A run of pairs a parser reads as one userinfo: the pair that opened it, and the last pair holding
// an `@` so far, -1 while none does.
interface Run { lastAt: number, start: number }

// The run after reading `part` of the pair at `index`: an `@` before the part's first URL_DELIMITER
// extends the run to this pair, and that delimiter closes it.
function readInto(run: Run, part: string, index: number, holdsAtSign: (text: string) => boolean): { closed?: Run, open?: Run } {
	const cut = part.search(URL_DELIMITER);
	const read = holdsAtSign(cut < 0 ? part : part.slice(0, cut)) ? { lastAt: index, start: run.start } : run;

	return cut < 0 ? { open: read } : { closed: read };
}

// One pair's effect on the scan: the runs it closes, and the run it leaves open. A pair can close the
// open run at its delimiter and open a new one, which its own value can close in turn.
function step(open: Run | undefined, [key, value]: [string, string], index: number, holdsAtSign: (text: string) => boolean): { closed: Run[], open?: Run } {
	const pair = `${key}=${value}`;
	const continued = open ? readInto(open, pair, index, holdsAtSign) : {};

	if (continued.open || !opensUserinfo(key)) {
		return { closed: continued.closed ? [continued.closed] : [], open: continued.open };
	}

	// The whole pair is tested first: readInto stops at the first delimiter, so it misses the `//x@` in
	// a value such as `ss//x@h`, which `?//u:p=ss%2F%2Fx@h` decodes to.
	const opened = readInto({ lastAt: holdsUserinfoInAnyDecoding(pair) ? index : -1, start: index }, value, index, holdsAtSign);

	return { closed: [continued.closed, opened.closed].filter(run => run !== undefined), open: opened.open };
}

// A parser reads the `&` in `?//u:p&w@host` as part of the userinfo, which the query splits into
// two pairs. A key opening userinfo starts a run: its value and each later pair join it, up to the
// first URL_DELIMITER. The indexes of the pairs from the run's start to its last `@` are returned,
// for the caller to redact whole. Keep `\` out of URL_DELIMITER, since userinfo after `//` may hold
// one; a run that a backslash opens may then redact a pair holding no credential. A value opening
// userinfo is a url of its own, so `?next=https://h&q=a@b` is kept.
export function pairsInUserinfoRuns(pairs: Array<[string, string]>, holdsAtSign: (text: string) => boolean): Set<number> {
	const runs: Run[] = [];
	let open: Run | undefined;

	pairs.forEach((pair, index) => {
		const read = step(open, pair, index, holdsAtSign);

		runs.push(...read.closed);
		open = read.open;
	});

	// A run still open at the query's end closes there.
	const all = open ? [...runs, open] : runs;

	return new Set(all.flatMap(({ lastAt, start }) => Array.from({ length: Math.max(0, lastAt - start + 1) }, (_, offset) => start + offset)));
}
