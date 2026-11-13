function bytesToHex(bytes: Uint8Array): string {
	return Array.from(bytes).map(byte => byte.toString(16).padStart(2, "0")).join("");
}

export function platformRandomBytes(size: number): Uint8Array {
	const bytes = new Uint8Array(size);
	const webcrypto = globalThis.crypto;

	if (webcrypto && typeof webcrypto.getRandomValues === "function") {
		webcrypto.getRandomValues(bytes);
	} else {
		// Fallback for runtimes without Web Crypto (eg. default Node 18 without the global flag)
		for (let i = 0; i < size; i++) {
			bytes[i] = Math.floor(Math.random() * 256);
		}
	}

	return bytes;
}

export function spanIdFrom(randomBytes: (size: number) => Uint8Array): string {
	return bytesToHex(randomBytes(8));
}

export function traceIdFrom(randomBytes: (size: number) => Uint8Array): string {
	return bytesToHex(randomBytes(16));
}

export function generateSpanId(): string {
	return spanIdFrom(platformRandomBytes);
}

export function generateTraceId(): string {
	return traceIdFrom(platformRandomBytes);
}

export function formatTraceparent(traceId: string, spanId: string, sampled: boolean = true): string {
	return `00-${traceId}-${spanId}-${sampled ? "01" : "00"}`;
}

// Parses a W3C `traceparent`. Untrusted input: returns null (never throws) for any malformed,
// version-ff or all-zero value, so the caller cleanly starts a fresh trace instead of continuing.
export function parseTraceparent(header: string): { flags: string, sampled: boolean, spanId: string, traceId: string } | null {
	const match = /^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/.exec(header.trim().toLowerCase());

	if (!match) {
		return null;
	}

	const [, version, traceId, spanId, flags] = match;

	// ff is reserved and all-zero ids are invalid per the spec; treat them as absent.
	if (version === "ff" || /^0+$/.test(traceId) || /^0+$/.test(spanId)) {
		return null;
	}

	return { flags, sampled: (parseInt(flags, 16) & 1) === 1, spanId, traceId };
}
