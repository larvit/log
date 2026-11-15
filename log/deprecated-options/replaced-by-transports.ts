import type { LogConf } from "../types.js";

// Each option `transports` replaces, with where its value goes instead.
export const REPLACED_BY_TRANSPORTS: readonly (readonly [keyof LogConf, string])[] = [
	["colors", "belongs to consoleTransport({ colors })"],
	["entryFormatter", "belongs to consoleTransport({ format })"],
	["format", "belongs to consoleTransport({ format })"],
	["otlpAdditionalHeaders", "belongs to otlpTransport({ headers })"],
	["otlpHttpBaseURI", "belongs to otlpTransport({ baseUrl })"],
	["otlpProtocol", "belongs to otlpTransport({ protocol })"],
	["otlpQueue", "is replaced by otlpTransport({ baseUrl }) or a transport of your own"],
	["printTraceInfo", "belongs to consoleTransport({ printTraceInfo })"],
	["stdout", "belongs to consoleTransport({ stdout })"],
];

// A list and the options it replaces never mix. `own` is what the caller wrote, before it inherits:
// an option there beside a list, the caller's or the one the Log will inherit, would have no effect.
export function rejectBesideTransports(own: LogConf, sources: (LogConf | undefined)[]): void {
	if (own.transports !== undefined && (!Array.isArray(own.transports) || own.transports.some(transport => typeof transport !== "object" || transport === null))) {
		throw new Error("transports takes a list of transports, such as [consoleTransport()]");
	}

	if (!own.transports && !sources.some(source => source?.transports)) {
		return;
	}

	for (const [key, goesTo] of REPLACED_BY_TRANSPORTS) {
		if (own[key] !== undefined) {
			throw new Error(`${key} ${goesTo}, since this Log ${own.transports ? "has" : "inherits"} transports`);
		}
	}
}

