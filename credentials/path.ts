import type { Decodings } from "./decodings.js";
import { decodings, inAnyDecoding, UNREADABLE } from "./decodings.js";
import { redactedWholeUrl } from "./query.js";
import { holdsListedKey, holdsUserinfoInAnyDecoding, redactTextUserinfo, SCHEME_LED } from "./text.js";

// Path segments opening a url, each read with the rest of the path. Past this limit a segment counts as
// holding a credential, as decodings.ts says of every reading limit.
const MAX_SCHEME_SEGMENTS = 8;

// The first segment before `before` that opens a url holding a credential, read with the rest of the
// path; -1 where there is none. Segment 0 is the empty text before the leading `/`, which opens no
// url, so the scan starts at 1.
function firstCredentialUrlSegment(segments: string[], read: Decodings[], before: number): number {
	let opened = 0;

	for (let index = 1; index < before; index++) {
		if (!inAnyDecoding(read[index], decoding => SCHEME_LED.test(decoding))) {
			continue;
		}

		opened++;

		const nested = decodings(segments.slice(index).join("/"));

		if (opened > MAX_SCHEME_SEGMENTS || inAnyDecoding(nested, decoding => SCHEME_LED.test(decoding) && (redactedWholeUrl(decoding) !== undefined || redactTextUserinfo(decoding) !== decoding))) {
			return index;
		}
	}

	return -1;
}

// Cut at the first segment whose nested url holds a credential: a later cut would leave an earlier
// url's userinfo in the kept prefix. A url nested with no scheme, or behind other text in its segment,
// still carries a query, so a segment holding a listed key cuts too.
export function redactedPath(pathname: string): string {
	const segments = pathname.split("/");
	const read = segments.map(segment => decodings(segment));

	if (read.includes(UNREADABLE)) {
		return "/REDACTED";
	}

	const listedKeyAt = read.findIndex(segmentRead => inAnyDecoding(segmentRead, holdsListedKey));
	// Only a url opened before the listed key can move the cut earlier.
	const urlAt = firstCredentialUrlSegment(segments, read, listedKeyAt === -1 ? segments.length : listedKeyAt);
	// Segments before `cutAt` are kept, and `REDACTED` replaces the rest; -1 keeps all.
	const cutAt = urlAt === -1 ? listedKeyAt : urlAt;
	const kept = cutAt === -1 ? pathname : [...segments.slice(0, cutAt), "REDACTED"].join("/");


	// Userinfo after `//`, `\\`, `/\` or `\/` needs no scheme and no query key, so both cuts can miss it.
	// That userinfo may sit in a decoding that maps to no raw segment, so the whole path goes.
	return holdsUserinfoInAnyDecoding(kept) ? "/REDACTED" : kept;
}
