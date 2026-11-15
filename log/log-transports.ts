import { queueTransport } from "./queue-transport.js";
import type { ResolvedLogConf } from "./types.js";
import type { Transport } from "../tracing/transport.js";

// The list a Log hands entries and spans to: `transports`, or else the default list, which the
// deprecated console and otlp* options make: `deprecatedConsole`, then `otlpQueue` where one is set.
// The default list reads the conf at each record, since 2.x documents that a write to
// `log.conf.format` or `log.conf.otlpQueue` takes effect from the next one. It is built per call
// and never kept, which holds a Log within README → Footprint's bytes per instance.
//
// The Log passes `deprecatedConsole`, which prints. The OpenTelemetry adapter exports only spans,
// which no console transport takes, and passes none.
export function transportsOf(conf: Pick<ResolvedLogConf, "otlpQueue" | "transports">, deprecatedConsole?: Transport): readonly Transport[] {
	return conf.transports ?? [
		...deprecatedConsole ? [deprecatedConsole] : [],
		...conf.otlpQueue ? [queueTransport(conf.otlpQueue)] : [],
	];
}
