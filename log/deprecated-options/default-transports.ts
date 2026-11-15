import { queueTransport } from "../queue-transport.js";
import type { ResolvedLogConf } from "../types.js";
import type { Transport } from "../../tracing/transport.js";

// The list a Log hands entries and spans to: `transports`, or else what the deprecated options
// make, which is `deprecatedConsole` and then `otlpQueue` where one is set. That default is built
// per call and never kept. So a write to `log.conf.otlpQueue` takes effect from the next record,
// as 2.x documents, and a Log stays within README → Footprint's bytes per instance.
export function transportsOf(conf: Pick<ResolvedLogConf, "otlpQueue" | "transports">, deprecatedConsole?: Transport): readonly Transport[] {
	return conf.transports ?? [
		...deprecatedConsole ? [deprecatedConsole] : [],
		...conf.otlpQueue ? [queueTransport(conf.otlpQueue)] : [],
	];
}
