import type { Decodings } from "./decodings.js";
import { decodings, inAnyDecoding, UNREADABLE } from "./decodings.js";
import { holdsListedKey, holdsUserinfoInAnyDecoding, redactTextUserinfo, SCHEME_LED } from "./text.js";
import { redactedWholeUrl } from "./query.js";

// Path segments opening a url, each read with the rest of the path. Past this limit a segment counts as
// holding a credential, as decodings.ts says of every reading limit.
const MAX_SCHEME_SEGMENTS = 8;

const opensCredentialUrl = (rest: Decodings) => inAnyDecoding(rest, decoding => SCHEME_LED.test(decoding) && (redactedWholeUrl(decoding) !== undefined || redactTextUserinfo(decoding) !== decoding));

// The segment `REDACTED` starts at, -1 where no segment cuts. A segment cuts when it holds a listed key,
// or starts with a scheme and the path from there on reads as a url holding a credential. The first
// segment that cuts wins, so no later cut leaves an earlier url's userinfo in the kept segments. A url
// nested with no scheme, or behind other text in its segment, still carries a query, which the listed
// key catches.
function firstCutSegment(segments: string[], read: Decodings[]): number {
	let schemeSegments = 0;

	for (let index = 0; index < segments.length; index++) {
		if (inAnyDecoding(read[index], holdsListedKey)) {
			return index;
		}

		if (!inAnyDecoding(read[index], decoding => SCHEME_LED.test(decoding))) {
			continue;
		}

		schemeSegments++;

		if (schemeSegments > MAX_SCHEME_SEGMENTS || opensCredentialUrl(decodings(segments.slice(index).join("/")))) {
			return index;
		}
	}

	return -1;
}

export function redactedPath(pathname: string): string {
	const segments = pathname.split("/");
	const read = segments.map(segment => decodings(segment));

	if (read.includes(UNREADABLE)) {
		return "/REDACTED";
	}

	const cutAt = firstCutSegment(segments, read);
	const kept = cutAt === -1 ? pathname : [...segments.slice(0, cutAt), "REDACTED"].join("/");

	// Userinfo after `//`, `\\`, `/\` or `\/` needs no scheme and no query key, so the cut can miss it.
	// That userinfo may sit in a decoding that maps to no raw segment, so the whole path goes.
	return holdsUserinfoInAnyDecoding(kept) ? "/REDACTED" : kept;
}
