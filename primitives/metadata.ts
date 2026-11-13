export type Metadata = {
	[key: string]: MetadataValue;
};

// Primitive values only. String() coerces them for OTLP; the JSON formatter keeps them native.
// bigint/objects are excluded: JSON.stringify throws on bigint and renders objects as "[object Object]".
export type MetadataValue = boolean | number | string;

// What a level method and `context` accept: an undefined key is dropped.
export type MetadataInput = {
	[key: string]: MetadataValue | undefined;
};

export function withoutUndefined(metadata: MetadataInput = {}): Metadata {
	const defined: Metadata = {};

	for (const key in metadata) {
		const value = metadata[key];

		if (value !== undefined) defined[key] = value;
	}

	return defined;
}
