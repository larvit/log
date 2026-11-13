// Reading limits, each bounding the work one value costs. Past a limit, the value counts as holding
// a credential, so a limit can only redact more, never let a credential through.

// Percent-decodings of one text.
const MAX_PERCENT_DECODINGS = 8;

// The decodings of a text encoded past MAX_PERCENT_DECODINGS: no reading is left to test.
export const UNREADABLE = Symbol("unreadable");

export type Decodings = string[] | typeof UNREADABLE;

// Text encoded past MAX_PERCENT_DECODINGS holds whatever a reader tests for.
export const inAnyDecoding = (readings: Decodings, test: (decoding: string) => boolean) => readings === UNREADABLE || readings.some(test);

// Run by run, never the whole string: decodeURIComponent throws on the first invalid escape.
export function percentDecoded(value: string): string {
	return value.replace(/(?:%[0-9A-Fa-f]{2})+/g, run => {
		try {
			return decodeURIComponent(run);
		} catch {
			// Only ASCII spells a url delimiter, so keep a non-UTF-8 run's ASCII and leave the rest.
			return run.replace(/%([0-9A-Fa-f]{2})/g, (escape, hex: string) => parseInt(hex, 16) < 0x80 ? String.fromCharCode(parseInt(hex, 16)) : escape);
		}
	});
}

// Every decoding: decoding a `%2F` inside userinfo puts a `/` before the `@`, so a match in one
// decoding can vanish in the next.
export function decodings(text: string): Decodings {
	const readings = [text];

	for (let decoded = percentDecoded(text); decoded !== readings[readings.length - 1]; decoded = percentDecoded(decoded)) {
		if (readings.length > MAX_PERCENT_DECODINGS) {
			return UNREADABLE;
		}

		readings.push(decoded);
	}

	return readings;
}

// A parser drops a tab, newline or carriage return: `si%09g` reads as `sig`.
export const withoutDropped = (text: string) => text.replace(/[\t\n\r]/g, "");

export const formDecoded = (text: string) => new URLSearchParams(`=${text}`).get("") ?? "";

export const changesInAnyDecoding = (text: string, redact: (decoding: string) => string) => inAnyDecoding(decodings(text), decoding => redact(decoding) !== decoding);
