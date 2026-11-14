import type { OtlpPayload } from "../payloads.js";

export type QueuedItem = { bytes: number, payload: OtlpPayload };

export function utf8Length(str: string): number {
	return new TextEncoder().encode(str).length;
}

// The JSON size bounds the protobuf size too, so one measure serves both encodings.
export function withBytes(payload: OtlpPayload): QueuedItem {
	return { bytes: utf8Length(JSON.stringify(payload)), payload };
}
