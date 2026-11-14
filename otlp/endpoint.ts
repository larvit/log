import { isCredentialHeaderName } from "../credentials/header-names.js";
import { byKind, type OtlpPayload } from "./payloads.js";
import type { ResolvedQueueConf } from "./queue-types.js";

type EndpointConf = Pick<ResolvedQueueConf, "acceptPlainHttpCredentials" | "otlpAdditionalHeaders" | "otlpHttpBaseURI">;

// Where a Queue's batches go, read from otlpHttpBaseURI.
export type OtlpEndpoint = {
	// The Basic credentials of a user:pass@ in the URI.
	authorization?: string,
	// Where a credential header would go in the clear past this machine unaccepted, else undefined.
	plainHttpHost?: string,
	// The base URI without userinfo or a trailing slash.
	url: string,
};

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

// RFC 9110 § 5.6.2: the grammar every valid header name follows.
const HEADER_NAME_TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;


function setsAuthorization(headers: Record<string, string> | undefined): boolean {
	return Object.keys(headers ?? {}).some(name => name.toLowerCase() === "authorization");
}

// Throws on a URI no batch could be sent to, and warns where the URI and otlpAdditionalHeaders both carry credentials.
export function resolveEndpoint(conf: EndpointConf, warn: (msg: string) => void): OtlpEndpoint {
	let base: URL;

	try {
		base = new URL(conf.otlpHttpBaseURI);
	} catch {
		// Never the URI itself: the thrown error is printed, and a password may be in it.
		throw new Error("otlpHttpBaseURI is not a valid URI; it needs an http:// or https:// prefix, and any / ? # \\ in a password percent-encoded");
	}

	// Any other scheme parses to an opaque path, leaving userinfo in pathname for `url` to
	// reassemble, and nothing but http(s) is fetchable anyway.
	if (base.protocol !== "http:" && base.protocol !== "https:") {
		throw new Error("otlpHttpBaseURI must be an http:// or https:// URI");
	}

	const authorization = basicAuth(base);

	if (authorization && setsAuthorization(conf.otlpAdditionalHeaders)) {
		warn("@larvit/log: otlpHttpBaseURI carries user:pass@ and otlpAdditionalHeaders sets Authorization, so the otlpAdditionalHeaders one is sent and the userinfo is not; set one of them, as 3.0.0 throws on both");
	}

	// URL has already canonicalised an IPv4 host, so 127.1 reads 127.0.0.1 here.
	const plainHttp = !conf.acceptPlainHttpCredentials && base.protocol === "http:" && !/^(localhost|127(\.\d+){3}|\[::1\])$/.test(base.hostname);

	return {
		authorization,
		plainHttpHost: plainHttp ? base.host : undefined,
		url: `${base.protocol}//${base.host}${base.pathname.replace(/\/$/, "")}`,
	};
}

// `base` with otlpAdditionalHeaders set over it, or the failure that stops the send.
// The value never joins the message; it is the likeliest place for a credential. A name that is
// no RFC 9110 token may be a whole header line, value and all, so its position stands in for it.
export function requestHeaders(base: Headers, additionalHeaders: Record<string, string> | undefined): { failure?: string, headers: Headers } {
	const headers = new Headers(base);

	for (const [index, [name, value]] of Object.entries(additionalHeaders ?? {}).entries()) {
		try {
			headers.set(name, value);
		} catch {
			const failure = HEADER_NAME_TOKEN.test(name) ? `an invalid ${name} header` : `an invalid header name at position ${index + 1} (counting from 1)`;

			return { failure: `otlpAdditionalHeaders carries ${failure}`, headers };
		}
	}

	return { headers };
}

// One warning per credential header going over plain http:. It names the header and never its value, since a value may be the credential.
export function plainHttpWarnings(headers: Headers, host: string, additionalHeaders: Record<string, string> | undefined): string[] {
	return [...headers].filter(([name]) => isCredentialHeaderName(name)).map(([name]) => {
		const source = name === "authorization" && !setsAuthorization(additionalHeaders) ? "user:pass@ in otlpHttpBaseURI" : "otlpAdditionalHeaders";

		return `@larvit/log: the ${name} header from ${source} goes over plain http: to ${host}, readable by anything on the network path; use an https: endpoint, or on a network you trust set acceptPlainHttpCredentials: true on the Queue`;
	});
}

// The path each kind of payload is posted to, under the endpoint's url.
export function otlpPath(payload: OtlpPayload): string {
	return byKind(payload, { logs: () => "/v1/logs", traces: () => "/v1/traces" });
}
