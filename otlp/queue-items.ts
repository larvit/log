import type { Clock } from "../primitives/clock.js";
import { stringField } from "../primitives/failure-fields.js";
import type { Metadata } from "../primitives/metadata.js";
import { type OtlpPayload, PAYLOAD_KEYS } from "./payloads.js";

// What Log exports through. Queue is the shipped implementation; any { enqueue, flush } will do.
export type OtlpQueue = {
	enqueue: (payload: OtlpPayload) => void;
	flush: () => Promise<void>;
};

// localStorage and React Native's AsyncStorage satisfy this as they are.
export type QueueStorage = {
	getItem: (key: string) => Promise<string | null | undefined> | string | null | undefined;
	removeItem: (key: string) => Promise<void> | void;
	setItem: (key: string, value: string) => Promise<void> | void;
};

export type QueueConf = {
	acceptPlainHttpCredentials?: boolean;
	batchDelayMs?: number;
	clock?: Clock;
	key?: string;
	maxBatchBytes?: number;
	maxItems?: number;
	otlpAdditionalHeaders?: Record<string, string>;
	otlpHttpBaseURI: string;
	otlpProtocol?: "http/json" | "http/protobuf";
	report?: (msg: string, metadata: Metadata) => void;
	retryDelayMs?: number;
	storage?: QueueStorage;
};

export type ResolvedQueueConf = QueueConf & Required<Pick<QueueConf, "acceptPlainHttpCredentials" | "batchDelayMs" | "clock" | "key" | "maxBatchBytes" | "maxItems" | "otlpProtocol" | "report" | "retryDelayMs">>;

export type QueuedItem = { bytes: number, payload: OtlpPayload };

export type SendFailure = { message: string, reportAs?: string, retry: boolean, status?: number };

// Browsers reject a keepalive request whose body is over 64 KiB.
export const KEEPALIVE_MAX_BYTES = 65536;

// A queue's protocol when its conf sets none, which a Log also reads to recognise its own default queue.
export const DEFAULT_OTLP_PROTOCOL = "http/json";

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

export function isOtlpPayload(value: unknown): value is OtlpPayload {
	return typeof value === "object" && value !== null
		&& Object.values(PAYLOAD_KEYS).some(key => Array.isArray(Reflect.get(value, key)));
}

// What a queue's storage holds: the payloads it saved, or why they can't be read.
export function parseStoredPayloads(raw: string): { error: string | undefined } | { payloads: OtlpPayload[] } {
	let parsed: unknown;

	try {
		parsed = JSON.parse(raw);
	} catch (err) {
		return { error: stringField(err, "message") };
	}

	if (!Array.isArray(parsed) || !parsed.every(isOtlpPayload)) {
		return { error: "not a list of OTLP payloads" };
	}

	return { payloads: parsed };
}
