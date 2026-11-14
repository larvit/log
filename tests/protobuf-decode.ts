// Independent reader (own varint/fixed64 logic) that decodes the hand-rolled OTLP protobuf back into
// the JSON encoding's shape, so an encoder bug can't hide behind symmetric reuse. Field numbers
// mirror the OTLP proto definitions.

export function pbReadVarint(buf: Uint8Array, pos: number): [bigint, number] {
	let result = 0n;
	let shift = 0n;
	let cursor = pos;

	for (;;) {
		const byte = buf[cursor++];

		result |= BigInt(byte & 0x7f) << shift;
		if ((byte & 0x80) === 0) break;
		shift += 7n;
	}

	return [result, cursor];
}

// Group one message's fields by field number. Values: bigint (varint/fixed64) or Uint8Array (len-delimited).
export function pbDecode(buf: Uint8Array): Map<number, (bigint | Uint8Array)[]> {
	const fields = new Map<number, (bigint | Uint8Array)[]>();
	let pos = 0;

	while (pos < buf.length) {
		const [tag, afterTag] = pbReadVarint(buf, pos);

		pos = afterTag;
		const fieldNo = Number(tag >> 3n);
		const wireType = Number(tag & 0x7n);
		let value: bigint | Uint8Array;

		if (wireType === 0) {
			[value, pos] = pbReadVarint(buf, pos);
		} else if (wireType === 1) {
			let acc = 0n;

			for (let i = 7; i >= 0; i--) acc = (acc << 8n) | BigInt(buf[pos + i]);
			value = acc;
			pos += 8;
		} else if (wireType === 2) {
			let len: bigint;

			[len, pos] = pbReadVarint(buf, pos);
			value = buf.slice(pos, pos + Number(len));
			pos += Number(len);
		} else {
			throw new Error(`unsupported wire type ${wireType}`);
		}

		const arr = fields.get(fieldNo) ?? [];

		arr.push(value);
		fields.set(fieldNo, arr);
	}

	return fields;
}

export const pbStr = (bytes: bigint | Uint8Array) => new TextDecoder().decode(bytes as Uint8Array);
export const pbHex = (bytes: bigint | Uint8Array) => Array.from(bytes as Uint8Array).map(byte => byte.toString(16).padStart(2, "0")).join("");
export const pbMsg = (field: bigint | Uint8Array) => pbDecode(field as Uint8Array);

// KeyValue { key=1: string, value=2: AnyValue { string_value=1 } }
export function pbKeyValue(bytes: bigint | Uint8Array) {
	const fields = pbDecode(bytes as Uint8Array);

	return { key: pbStr(fields.get(1)![0]), value: { stringValue: pbStr(pbMsg(fields.get(2)![0]).get(1)![0]) } };
}

// Resource { attributes=1: repeated KeyValue }
export const pbResourceAttrs = (bytes: bigint | Uint8Array) => (pbDecode(bytes as Uint8Array).get(1) ?? []).map(pbKeyValue);

// InstrumentationScope { name=1, version=2 }
export function pbScope(bytes: bigint | Uint8Array) {
	const scope = pbMsg(bytes);

	return { name: pbStr(scope.get(1)![0]), version: pbStr(scope.get(2)![0]) };
}

// ExportLogsServiceRequest -> ResourceLogs[0] -> ScopeLogs[0] -> LogRecord[0]
export function pbDecodeLogs(buf: Uint8Array) {
	const resLog = pbMsg(pbDecode(buf).get(1)![0]);
	const scopeLog = pbMsg(resLog.get(2)![0]);
	const rec = pbMsg(scopeLog.get(2)![0]);

	return {
		logRecord: {
			attributes: (rec.get(6) ?? []).map(pbKeyValue),
			body: pbStr(pbMsg(rec.get(5)![0]).get(1)![0]),
			severityNumber: Number(rec.get(2)![0]),
			severityText: pbStr(rec.get(3)![0]),
			spanId: pbHex(rec.get(10)![0]),
			timeUnixNano: String(rec.get(1)![0]),
			traceId: pbHex(rec.get(9)![0]),
		},
		resourceAttrs: pbResourceAttrs(resLog.get(1)![0]),
		scope: pbScope(scopeLog.get(1)![0]),
	};
}

// ExportTraceServiceRequest -> ResourceSpans[0] -> ScopeSpans[0] -> Span[0]
export function pbDecodeSpans(buf: Uint8Array) {
	const resSpan = pbMsg(pbDecode(buf).get(1)![0]);
	const scopeSpan = pbMsg(resSpan.get(2)![0]);
	const span = pbMsg(scopeSpan.get(2)![0]);

	return {
		resourceAttrs: pbResourceAttrs(resSpan.get(1)![0]),
		scope: pbScope(scopeSpan.get(1)![0]),

		span: {
			attributes: (span.get(9) ?? []).map(pbKeyValue),
			endTimeUnixNano: String(span.get(8)![0]),
			kind: Number(span.get(6)![0]),
			name: pbStr(span.get(5)![0]),
			spanId: pbHex(span.get(2)![0]),
			startTimeUnixNano: String(span.get(7)![0]),
			statusCode: span.get(15) ? Number(pbMsg(span.get(15)![0]).get(3)?.[0] ?? 0n) : 0,
			statusMessage: span.get(15) && pbMsg(span.get(15)![0]).get(2) ? pbStr(pbMsg(span.get(15)![0]).get(2)![0]) : undefined,
			traceId: pbHex(span.get(1)![0]),
		},
	};
}
