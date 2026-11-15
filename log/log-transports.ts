import { buildSpanPayload } from "../otlp/payloads.js";
import type { ResolvedLogConf } from "./types.js";
import type { Transport } from "../tracing/transport.js";

// The list a Log hands entries and spans to: `transports`, or else what the deprecated console and
// otlp* options make. That default reads the conf at each record, since 2.x documents that a write
// to `log.conf.format` or `log.conf.otlpQueue` takes effect from the next one. It is built per call
// and never kept, which holds a Log within README → Footprint's bytes per instance.
//
// `deprecatedEntry` is the default's entry side, which the Log passes: it prints, so naming it here
// would put the console writer in `otel.js`. The OpenTelemetry adapter exports only spans and passes none.
export function transportsOf(conf: Pick<ResolvedLogConf, "otlpQueue" | "transports">, deprecatedEntry?: Transport["entry"]): readonly Transport[] {
	return conf.transports ?? [{
		entry: deprecatedEntry,
		flush: () => conf.otlpQueue?.flush(),
		span: span => { conf.otlpQueue?.enqueue(buildSpanPayload(span)); },
	}];
}
