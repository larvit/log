import { isCredentialHeaderName } from "../credentials/header-names.js";
import { stringField } from "../primitives/failure-fields.js";
import { type Metadata, withoutUndefined } from "../primitives/metadata.js";
import { byKind, type OtlpLogPayload, type OtlpPayload, type OtlpScope, type OtlpSpanPayload } from "./payloads.js";
import { encodeOtlpProtobuf } from "./protobuf.js";
import { type QueuedItem, utf8Length } from "./queue-items.js";
import type { ResolvedQueueConf } from "./queue-types.js";

export type SendFailure = { message: string, reportAs?: string, retry: boolean, status?: number };

// Browsers reject a keepalive request whose body is over 64 KiB.
export const KEEPALIVE_MAX_BYTES = 65536;

const OTLP_EXPORT_TIMEOUT_MS = 3000;

// A malformed percent escape passes through undecoded rather than throwing, so an odd password
// cannot break the constructor.
function basicAuth(base: URL): string | undefined {
	if (!base.username && !base.password) {
		return undefined;
	}

	const decoded = [base.username, base.password].map(part => {
		try {
			return decodeURIComponent(part);
		} catch {
			return part;
		}
	});

	return `Basic ${btoa(String.fromCharCode(...new TextEncoder().encode(decoded.join(":"))))}`;
}

// OTLP partialSuccess: proto3 JSON writes the int64 count as a string, some collectors as a number.
function partialRejection(body: unknown): { message?: string, rejected: number } | undefined {
	try {
		const partial: unknown = typeof body === "object" && body !== null ? Reflect.get(body, "partialSuccess") : undefined;

		if (typeof partial !== "object" || partial === null) return undefined;

		const rejected = Number(Reflect.get(partial, "rejectedLogRecords") ?? Reflect.get(partial, "rejectedSpans") ?? 0);

		return rejected > 0 ? { message: stringField(partial, "errorMessage"), rejected } : undefined;
	} catch {
		return undefined;
	}
}

function otlpPath(payload: OtlpPayload): string {
	return byKind(payload, { logs: () => "/v1/logs", traces: () => "/v1/traces" });
}

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

// RFC 9110 § 5.6.2: the grammar every valid header name follows.
const HEADER_NAME_TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

// Read live, so a rotated otlpAdditionalHeaders reaches the next send; report is the caller's guarded one.
type SenderConf = Pick<ResolvedQueueConf, "acceptPlainHttpCredentials" | "clock" | "otlpAdditionalHeaders" | "otlpHttpBaseURI" | "otlpProtocol">;

function setsAuthorization(headers: Record<string, string> | undefined): boolean {
	return Object.keys(headers ?? {}).some(name => name.toLowerCase() === "authorization");
}

export class OtlpSender {
	private readonly conf: SenderConf;
	private readonly headers: Headers;
	private readonly protobuf: boolean;
	private readonly report: ResolvedQueueConf["report"];
	private readonly url: string;
	private readonly warn: (msg: string) => void;

	// Where a credential header would go in the clear past this machine unaccepted, else undefined.
	private readonly plainHttpHost?: string;

	constructor(conf: SenderConf, report: ResolvedQueueConf["report"], warn: (msg: string) => void) {
		let base: URL;

		try {
			base = new URL(conf.otlpHttpBaseURI);
		} catch {
			// Never the URI itself: the thrown error is printed, and a password may be in it.
			throw new Error("otlpHttpBaseURI is not a valid URI; it needs an http:// or https:// prefix, and any / ? # \\ in a password percent-encoded");
		}

		// Any other scheme parses to an opaque path, leaving userinfo in pathname for this.url to
		// reassemble, and nothing but http(s) is fetchable anyway.
		if (base.protocol !== "http:" && base.protocol !== "https:") {
			throw new Error("otlpHttpBaseURI must be an http:// or https:// URI");
		}

		const auth = basicAuth(base);

		this.conf = conf;
		this.protobuf = conf.otlpProtocol === "http/protobuf";
		this.report = report;
		this.warn = warn;
		this.url = `${base.protocol}//${base.host}${base.pathname.replace(/\/$/, "")}`;
		this.headers = new Headers({ "Content-Type": this.protobuf ? "application/x-protobuf" : "application/json" });

		if (auth) {
			this.headers.set("Authorization", auth);

			if (setsAuthorization(conf.otlpAdditionalHeaders)) {
				warn("@larvit/log: otlpHttpBaseURI carries user:pass@ and otlpAdditionalHeaders sets Authorization, so the otlpAdditionalHeaders one is sent and the userinfo is not; set one of them, as 3.0.0 throws on both");
			}
		}

		// URL has already canonicalised an IPv4 host, so 127.1 reads 127.0.0.1 here.
		if (!conf.acceptPlainHttpCredentials && base.protocol === "http:" && !/^(localhost|127(\.\d+){3}|\[::1\])$/.test(base.hostname)) {
			this.plainHttpHost = base.host;
		}
	}

	// The value never joins the message; it is the likeliest place for a credential. A name that is
	// no RFC 9110 token may be a whole header line, value and all, so its position stands in for it.
	private buildHeaders(): { failure?: string, headers: Headers } {
		const headers = new Headers(this.headers);

		for (const [index, [name, value]] of Object.entries(this.conf.otlpAdditionalHeaders ?? {}).entries()) {
			try {
				headers.set(name, value);
			} catch {
				const failure = HEADER_NAME_TOKEN.test(name) ? `an invalid ${name} header` : `an invalid header name at position ${index + 1} (counting from 1)`;

				return { failure: `otlpAdditionalHeaders carries ${failure}`, headers };
			}
		}

		return { headers };
	}

	async send(batch: QueuedItem[]): Promise<SendFailure | undefined> {
		const { failure, headers } = this.buildHeaders();

		if (failure) {
			return { message: failure, reportAs: "OTLP export headers invalid, batch dropped", retry: false };
		}

		if (this.plainHttpHost !== undefined) {
			// The message names the header and never its value, since a value may be the credential.
			for (const [name] of headers) {
				if (isCredentialHeaderName(name)) {
					const source = name === "authorization" && !setsAuthorization(this.conf.otlpAdditionalHeaders) ? "user:pass@ in otlpHttpBaseURI" : "otlpAdditionalHeaders";

					this.warn(`@larvit/log: the ${name} header from ${source} goes over plain http: to ${this.plainHttpHost}, readable by anything on the network path; use an https: endpoint, or on a network you trust set acceptPlainHttpCredentials: true on the Queue`);
				}
			}
		}

		let body: string | Uint8Array<ArrayBuffer>;

		// A payload that cannot be encoded (a corrupt stored item, no TextEncoder) never becomes sendable.
		try {
			const payload = mergePayloads(batch.map(item => item.payload));

			body = this.protobuf ? encodeOtlpProtobuf(payload) : JSON.stringify(payload);
		} catch (err) {
			return { message: stringField(err, "message") ?? "Unencodable OTLP payload", retry: false };
		}

		const bytes = typeof body === "string" ? utf8Length(body) : body.length;

		// AbortController + cleared timer works in browsers and Node, and never leaves a dangling timer.
		const controller = new AbortController();
		const abortTimer = this.conf.clock.setTimeout(() => controller.abort(), OTLP_EXPORT_TIMEOUT_MS);

		try {
			const res = await fetch(this.url + otlpPath(batch[0].payload), {
				body,
				headers,
				keepalive: bytes <= KEEPALIVE_MAX_BYTES,
				method: "POST",
				signal: controller.signal,
			});

			if (!res.ok) {
				return {
					message: "Non-ok return status",
					...res.status === 401 || res.status === 403 ? { reportAs: "OTLP export unauthorized, batch dropped" } : {},
					retry: res.status === 408 || res.status === 429 || res.status >= 500,
					status: res.status,
				};
			}

			// Protobuf responses are binary; only the JSON encoding reads the body, for a partialSuccess.
			if (!this.protobuf) {
				const rejection = partialRejection(await res.json().catch(() => undefined));

				if (rejection) {
					this.report("OTLP export partially rejected", { ...this.describe(batch, { message: rejection.message, status: res.status }), rejected: rejection.rejected });
				}
			}

			return undefined;
		} catch (err) {
			return { message: stringField(err, "message") ?? "Unknown error sending to OTLP", retry: true };
		} finally {
			this.conf.clock.clearTimeout(abortTimer);
		}
	}

	describe(batch: QueuedItem[], outcome: { message?: string, status?: number }): Metadata {
		const path = otlpPath(batch[0].payload);

		return withoutUndefined({ error: outcome.message, items: batch.length, path, status: outcome.status, url: this.url + path });
	}
}
