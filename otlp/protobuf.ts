// OTLP/HTTP protobuf encoding: a hand-rolled wire encoder for the small, frozen OTLP subset this
// library emits. It has no dependency, so the built file runs anywhere. Field numbers are from the
// OTLP proto defs (v1).

import { byKind, type OtlpAttribute, type OtlpLogPayload, type OtlpPayload, type OtlpScope, type OtlpSpanPayload } from "./payloads.js";

const WIRE_VARINT = 0;
const WIRE_FIXED64 = 1;
const WIRE_LEN = 2;

class ProtoWriter {
	private readonly buf: number[] = [];

	// Uint8Array<ArrayBuffer> (not the ArrayBufferLike default) so the result is a valid fetch BodyInit.
	finish(): Uint8Array<ArrayBuffer> {
		return new Uint8Array(this.buf);
	}

	// Non-negative integer < 2^53 (tags, lengths, enums, counts). Modulo/division sidesteps the
	// 32-bit truncation of bitwise ops, so no BigInt is needed for these.
	private pushVarint(value: number): void {
		while (value > 0x7f) {
			this.buf.push((value % 128) | 0x80);
			value = Math.floor(value / 128);
		}
		this.buf.push(value);
	}

	private pushTag(fieldNo: number, wireType: number): void {
		this.pushVarint((fieldNo * 8) + wireType);
	}

	private pushLen(fieldNo: number, data: ArrayLike<number>): void {
		this.pushTag(fieldNo, WIRE_LEN);
		this.pushVarint(data.length);
		for (let i = 0; i < data.length; i++) {
			this.buf.push(data[i]);
		}
	}

	// int32/uint32/enum/bool field.
	uint(fieldNo: number, value: number): this {
		this.pushTag(fieldNo, WIRE_VARINT);
		this.pushVarint(value);

		return this;
	}

	// fixed64 field from a decimal string (eg. a ns timestamp that overflows Number). 8 bytes, LE.
	fixed64(fieldNo: number, decimal: string): this {
		this.pushTag(fieldNo, WIRE_FIXED64);
		let rest = BigInt(decimal);
		const mask = BigInt(0xff);
		const eight = BigInt(8);

		for (let i = 0; i < 8; i++) {
			this.buf.push(Number(rest & mask));
			rest = rest >> eight;
		}

		return this;
	}

	string(fieldNo: number, value: string): this {
		this.pushLen(fieldNo, new TextEncoder().encode(value));

		return this;
	}

	bytes(fieldNo: number, value: Uint8Array): this {
		this.pushLen(fieldNo, value);

		return this;
	}

	message(fieldNo: number, write: (sub: ProtoWriter) => void): this {
		const sub = new ProtoWriter();

		write(sub);
		this.pushLen(fieldNo, sub.buf);

		return this;
	}
}

function hexToBytes(hex: string): Uint8Array {
	const out = new Uint8Array(hex.length / 2);

	for (let i = 0; i < out.length; i++) {
		out[i] = parseInt(hex.slice(i * 2, (i * 2) + 2), 16);
	}

	return out;
}

// KeyValue { key = 1, value = 2: AnyValue { string_value = 1 } }
function writeKeyValue(writer: ProtoWriter, attr: OtlpAttribute): void {
	writer.string(1, attr.key);
	writer.message(2, value => value.string(1, attr.value.stringValue));
}

// InstrumentationScope { name = 1, version = 2 }
function writeScope(writer: ProtoWriter, scope: OtlpScope | undefined): void {
	if (scope) {
		writer.message(1, scopeMsg => { // ScopeLogs.scope = 1, ScopeSpans.scope = 1
			scopeMsg.string(1, scope.name);
			if (scope.version !== undefined) scopeMsg.string(2, scope.version);
		});
	}
}

// Resource / Span / LogRecord attributes are all repeated KeyValue.
function writeAttributes(writer: ProtoWriter, fieldNo: number, attributes: OtlpAttribute[]): void {
	for (const attr of attributes) {
		writer.message(fieldNo, attrMsg => writeKeyValue(attrMsg, attr));
	}
}

function encodeOtlpLogPayload(payload: OtlpLogPayload): Uint8Array<ArrayBuffer> {
	const root = new ProtoWriter(); // ExportLogsServiceRequest

	for (const resourceLog of payload.resourceLogs) {
		root.message(1, resLogs => { // resource_logs = 1
			resLogs.message(1, resource => writeAttributes(resource, 1, resourceLog.resource.attributes)); // ResourceLogs.resource = 1
			for (const scopeLog of resourceLog.scopeLogs) {
				resLogs.message(2, scopeMsg => { // ResourceLogs.scope_logs = 2
					writeScope(scopeMsg, scopeLog.scope);
					for (const record of scopeLog.logRecords) {
						scopeMsg.message(2, logRec => { // ScopeLogs.log_records = 2
							logRec.fixed64(1, record.timeUnixNano); // time_unix_nano = 1
							logRec.uint(2, record.severityNumber); // severity_number = 2
							logRec.string(3, record.severityText); // severity_text = 3
							logRec.message(5, body => body.string(1, record.body.stringValue)); // body = 5 (AnyValue.string_value)
							writeAttributes(logRec, 6, record.attributes ?? []); // attributes = 6
							if (record.traceId) logRec.bytes(9, hexToBytes(record.traceId)); // trace_id = 9
							if (record.spanId) logRec.bytes(10, hexToBytes(record.spanId)); // span_id = 10
						});
					}
				});
			}
		});
	}

	return root.finish();
}

function encodeOtlpSpanPayload(payload: OtlpSpanPayload): Uint8Array<ArrayBuffer> {
	const root = new ProtoWriter(); // ExportTraceServiceRequest

	for (const resourceSpan of payload.resourceSpans) {
		root.message(1, resSpans => { // resource_spans = 1
			resSpans.message(1, resource => writeAttributes(resource, 1, resourceSpan.resource.attributes)); // ResourceSpans.resource = 1
			for (const scopeSpan of resourceSpan.scopeSpans) {
				resSpans.message(2, scopeMsg => { // ResourceSpans.scope_spans = 2
					writeScope(scopeMsg, scopeSpan.scope);
					for (const span of scopeSpan.spans) {
						scopeMsg.message(2, spanMsg => { // ScopeSpans.spans = 2
							spanMsg.bytes(1, hexToBytes(span.traceId)); // trace_id = 1
							spanMsg.bytes(2, hexToBytes(span.spanId)); // span_id = 2
							if (span.parentSpanId) spanMsg.bytes(4, hexToBytes(span.parentSpanId)); // parent_span_id = 4
							spanMsg.string(5, span.name); // name = 5
							spanMsg.uint(6, span.kind); // kind = 6
							spanMsg.fixed64(7, span.startTimeUnixNano); // start_time_unix_nano = 7
							spanMsg.fixed64(8, span.endTimeUnixNano); // end_time_unix_nano = 8
							writeAttributes(spanMsg, 9, span.attributes); // attributes = 9
							if (span.status.code) {
								spanMsg.message(15, status => { // status = 15
									if (span.status.message !== undefined) status.string(2, span.status.message); // Status.message = 2
									status.uint(3, span.status.code); // Status.code = 3
								});
							}
						});
					}
				});
			}
		});
	}

	return root.finish();
}

export function encodeOtlpProtobuf(payload: OtlpPayload): Uint8Array<ArrayBuffer> {
	return byKind(payload, { logs: encodeOtlpLogPayload, traces: encodeOtlpSpanPayload });
}
