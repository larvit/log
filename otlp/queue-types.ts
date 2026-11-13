import type { Clock } from "../primitives/clock.js";
import type { Metadata } from "../primitives/metadata.js";
import type { OtlpPayload } from "./payloads.js";

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

// A queue's protocol when its conf sets none, which a Log also reads to recognise its own default queue.
export const DEFAULT_OTLP_PROTOCOL = "http/json";
