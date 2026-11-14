import { stringField } from "../primitives/failure-fields.js";
import { byKind, type OtlpLogPayload, type OtlpPayload, type OtlpScope, type OtlpSpanPayload } from "./payloads.js";
import { encodeOtlpProtobuf } from "./protobuf.js";
import type { QueuedItem } from "./queue-items.js";
import type { SendFailure } from "./response.js";

// Browsers reject a keepalive request whose body is over 64 KiB.
export const KEEPALIVE_MAX_BYTES = 65536;

// Items sharing a key become one, in first-seen order.
function groupBy<T>(items: T[], keyOf: (item: T) => string, join: (group: T[]) => T): T[] {
	const groups = new Map<string, T[]>();

	for (const item of items) {
		const key = keyOf(item);
		const group = groups.get(key);

		if (group) {
			group.push(item);
		} else {
			groups.set(key, [item]);
		}
	}

	return [...groups.values()].map(join);
}

const resourceKey = (entry: { resource: unknown }) => JSON.stringify(entry.resource);

// A payload an older version stored carries no scope on its logs, and its span name as its spans' scope; payloads merge by this key.
const scopeKey = (entry: { scope?: OtlpScope }) => JSON.stringify([entry.scope?.name, entry.scope?.version]);

function mergeLogPayloads(payloads: OtlpLogPayload[]): OtlpLogPayload {
	return {
		resourceLogs: groupBy(payloads.flatMap(payload => payload.resourceLogs), resourceKey, resources => ({
			...resources[0],
			scopeLogs: groupBy(resources.flatMap(entry => entry.scopeLogs), scopeKey, scopes => ({ ...scopes[0], logRecords: scopes.flatMap(entry => entry.logRecords) })),
		})),
	};
}

function mergeSpanPayloads(payloads: OtlpSpanPayload[]): OtlpSpanPayload {
	return {
		resourceSpans: groupBy(payloads.flatMap(payload => payload.resourceSpans), resourceKey, resources => ({
			...resources[0],
			scopeSpans: groupBy(resources.flatMap(entry => entry.scopeSpans), scopeKey, scopes => ({ ...scopes[0], spans: scopes.flatMap(entry => entry.spans) })),
		})),
	};
}

// A batch holds one kind, so the first payload decides.
function mergePayloads(payloads: OtlpPayload[]): OtlpPayload {
	return byKind<OtlpPayload>(payloads[0], {
		logs: () => mergeLogPayloads(payloads.flatMap(payload =>
			byKind<OtlpLogPayload[]>(payload, { logs: log => [log], traces: () => [] }))),
		traces: () => mergeSpanPayloads(payloads.flatMap(payload =>
			byKind<OtlpSpanPayload[]>(payload, { logs: () => [], traces: span => [span] }))),
	});
}

// A payload that cannot be encoded (a corrupt stored item, no TextEncoder) never becomes sendable.
export function encodeBatch(batch: QueuedItem[], protobuf: boolean): { body: string | Uint8Array<ArrayBuffer> } | { failure: SendFailure } {
	try {
		const payload = mergePayloads(batch.map(item => item.payload));

		return { body: protobuf ? encodeOtlpProtobuf(payload) : JSON.stringify(payload) };
	} catch (err) {
		return { failure: { message: stringField(err, "message") ?? "Unencodable OTLP payload", retry: false } };
	}
}
