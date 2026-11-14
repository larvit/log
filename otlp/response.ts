import { stringField } from "../primitives/failure-fields.js";

// Why a batch was not delivered: whether to retry it, and what to report.
export type SendFailure = { message: string, reportAs?: string, retry: boolean, status?: number };

// What a response status means for its batch: undefined when delivered, else whether to retry and what to report.
export function statusFailure(status: number): SendFailure | undefined {
	if (status >= 200 && status < 300) {
		return undefined;
	}

	return {
		message: "Non-ok return status",
		...status === 401 || status === 403 ? { reportAs: "OTLP export unauthorized, batch dropped" } : {},
		retry: status === 408 || status === 429 || status >= 500,
		status,
	};
}

// OTLP partialSuccess: proto3 JSON writes the int64 count as a string, some collectors as a number.
export function partialRejection(body: unknown): { message?: string, rejected: number } | undefined {
	try {
		const partial: unknown = typeof body === "object" && body !== null ? Reflect.get(body, "partialSuccess") : undefined;

		if (typeof partial !== "object" || partial === null) return undefined;

		const rejected = Number(Reflect.get(partial, "rejectedLogRecords") ?? Reflect.get(partial, "rejectedSpans") ?? 0);

		return rejected > 0 ? { message: stringField(partial, "errorMessage"), rejected } : undefined;
	} catch {
		return undefined;
	}
}
