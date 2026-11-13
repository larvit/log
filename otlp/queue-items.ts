import type { OtlpPayload } from "./payloads.js";

export type QueuedItem = { bytes: number, payload: OtlpPayload };

export function utf8Length(str: string): number {
	let bytes = 0;

	for (let i = 0; i < str.length; i++) {
		const code = str.charCodeAt(i);

		if (code < 0x80) {
			bytes += 1;
		} else if (code < 0x800) {
			bytes += 2;
		} else if (code >= 0xd800 && code < 0xdc00) {
			bytes += 4;
			i++;
		} else {
			bytes += 3;
		}
	}

	return bytes;
}

// The JSON size bounds the protobuf size too, so one measure serves both encodings.
export function withBytes(payload: OtlpPayload): QueuedItem {
	return { bytes: utf8Length(JSON.stringify(payload)), payload };
}
