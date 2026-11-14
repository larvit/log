import { stringField } from "../primitives/failure-fields.js";
import { type Metadata, withoutUndefined } from "../primitives/metadata.js";
import { encodeBatch, KEEPALIVE_MAX_BYTES } from "./batch.js";
import { otlpPath, plainHttpWarnings, requestHeaders, resolveEndpoint } from "./endpoint.js";
import { type QueuedItem, utf8Length } from "./queue-items.js";
import type { ResolvedQueueConf } from "./queue-types.js";
import { partialRejection, type SendFailure, statusFailure } from "./response.js";

const OTLP_EXPORT_TIMEOUT_MS = 3000;

// Read live, so a rotated otlpAdditionalHeaders reaches the next send; report is the caller's guarded one.
type SenderConf = Pick<ResolvedQueueConf, "acceptPlainHttpCredentials" | "clock" | "otlpAdditionalHeaders" | "otlpHttpBaseURI" | "otlpProtocol">;

// The HTTP send of one batch: the endpoint's headers, the encoded body, a timeout, and what the response means.
export class OtlpSender {
	private readonly conf: SenderConf;
	private readonly headers: Headers;
	private readonly plainHttpHost?: string;
	private readonly protobuf: boolean;
	private readonly report: ResolvedQueueConf["report"];
	private readonly url: string;
	private readonly warn: (msg: string) => void;

	constructor(conf: SenderConf, report: ResolvedQueueConf["report"], warn: (msg: string) => void) {
		const { authorization, plainHttpHost, url } = resolveEndpoint(conf, warn);

		this.conf = conf;
		this.plainHttpHost = plainHttpHost;
		this.protobuf = conf.otlpProtocol === "http/protobuf";
		this.report = report;
		this.warn = warn;
		this.url = url;
		this.headers = new Headers({ "Content-Type": this.protobuf ? "application/x-protobuf" : "application/json" });

		if (authorization) {
			this.headers.set("Authorization", authorization);
		}
	}

	async send(batch: QueuedItem[]): Promise<SendFailure | undefined> {
		const { failure, headers } = requestHeaders(this.headers, this.conf.otlpAdditionalHeaders);

		if (failure) {
			return { message: failure, reportAs: "OTLP export headers invalid, batch dropped", retry: false };
		}

		if (this.plainHttpHost !== undefined) {
			for (const msg of plainHttpWarnings(headers, this.plainHttpHost, this.conf.otlpAdditionalHeaders)) {
				this.warn(msg);
			}
		}

		const encoded = encodeBatch(batch, this.protobuf);

		if ("failure" in encoded) {
			return encoded.failure;
		}

		const { body } = encoded;
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

			const rejected = statusFailure(res.status);

			if (rejected) {
				return rejected;
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
