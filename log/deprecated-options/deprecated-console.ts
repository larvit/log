import type { ResolvedLogConf } from "../types.js";
import { resolveFormatter } from "../entry-format.js";
import type { Transport } from "../../tracing/transport.js";
import { withTraceInfo, writeConsoleLine } from "../console-output.js";

// The console the deprecated options make. Unlike consoleTransport it reads the conf at each entry,
// and its printTraceInfo prints `ownSpan`, the span of the Log that logged, as 2.x does, even where
// the entry is exported under the parent's.
export function deprecatedConsole(conf: ResolvedLogConf, ownSpan: { name: string, spanId: string, traceId: string }): Transport {
	return {
		entry({ logLevel, metadata, msg, msTimestamp }) {
			// The formatter gets a copy, so one that changes it changes nothing that is exported.
			const printed = conf.printTraceInfo ? withTraceInfo(metadata, { spanId: ownSpan.spanId, spanName: ownSpan.name, traceId: ownSpan.traceId }) : { ...metadata };

			writeConsoleLine(conf, resolveFormatter(conf), { logLevel, metadata: printed, msTimestamp, msg });
		},
	};
}
