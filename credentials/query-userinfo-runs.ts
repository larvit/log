import { decodings, inAnyDecoding, percentDecoded } from "./decodings.js";
import { opensUserinfoInAnyDecoding } from "./text.js";

const URL_DELIMITER = /[/?# ]/;

type QueryPairs = Array<[string, string]>;

const holdsAtSignInAnyDecoding = (text: string) => inAnyDecoding(decodings(text), decoding => decoding.includes("@"));

// A parser reads the `&` in `?//u:p&w@host` as part of the userinfo, which the query splits into
// two pairs. So a key opening userinfo starts a run: the text after that key, through its value and
// each later pair, up to the first URL_DELIMITER. The run's pairs, from the one whose key opened it to
// the last one holding an `@` in the run, are redacted whole. Keep `\` out of URL_DELIMITER, since userinfo after `//` may
// hold one; a run that a backslash opens may then redact a pair holding no credential. A value opening
// userinfo is a url of its own, so `?next=https://h&q=a@b` is kept.
function pairsInUserinfoRuns(pairs: QueryPairs, holdsAtSign: (text: string) => boolean): number[] {
	const inRuns: number[] = [];
	// While a run is open: the pair whose key opened it, and the last pair so far holding an `@` in it.
	let start: number | undefined;
	let lastAtSign: number | undefined;

	const closeRun = () => {
		if (start !== undefined && lastAtSign !== undefined) {
			for (let index = start; index <= lastAtSign; index++) inRuns.push(index);
		}

		start = undefined;
		lastAtSign = undefined;
	};

	// One key or value of the pair at `index`, read into the open run: an `@` before the text's first
	// URL_DELIMITER makes `index` the run's last pair so far, and the delimiter closes the run.
	const readIntoRun = (text: string, index: number) => {
		const delimiterAt = text.search(URL_DELIMITER);

		if (holdsAtSign(delimiterAt < 0 ? text : text.slice(0, delimiterAt))) {
			lastAtSign = index;
		}

		if (delimiterAt >= 0) {
			closeRun();
		}
	};

	pairs.forEach(([key, value], index) => {
		if (start !== undefined) {
			readIntoRun(key, index);
		}

		// A key opening userinfo inside a run joins it; one whose delimiter closed the run opens the next.
		if (start === undefined && opensUserinfoInAnyDecoding(key)) {
			start = index;
		}

		if (start !== undefined) {
			readIntoRun(value, index);
		}
	});

	// A run still going at the query's end closes there.
	closeRun();

	return inRuns;
}

// The indexes of the pairs inside a run of userinfo in any of three readings of the query, each as a
// consumer may read it, given the query's pairs raw and form-decoded. Dropping a reading
// can only let a credential through. Raw, only a literal delimiter ends a run and only a literal `@` counts: a
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
