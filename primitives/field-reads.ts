// Total: a throwing getter yields undefined, so the flush path never rejects on its input.
function readField(value: unknown, key: string): unknown {
	try {
		return typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
	} catch {
		return undefined;
	}
}

export function stringField(value: unknown, key: string): string | undefined {
	const read = readField(value, key);

	return typeof read === "string" ? read : undefined;
}

export function numberFieldAsString(value: unknown, key: string): string | undefined {
	const read = readField(value, key);

	return typeof read === "number" ? String(read) : undefined;
}
