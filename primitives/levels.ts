export type LogLevel = keyof typeof LogLevels;

export const LogLevels = {
	/* eslint-disable sort-keys */
	error: {
		severityNumber: 17,
		severityText: "ERROR",
	},
	warn: {
		severityNumber: 13,
		severityText: "WARN",
	},
	info: {
		severityNumber: 9,
		severityText: "INFO",
	},
	verbose: {
		severityNumber: 6,
		severityText: "DEBUG2",
	},
	debug: {
		severityNumber: 5,
		severityText: "DEBUG",
	},
	silly: {
		severityNumber: 1,
		severityText: "TRACE",
	},
	/* eslint-enable sort-keys */
};

// The level an unset logLevel resolves to, and the one an unknown logLevel logs at.
export const DEFAULT_LOG_LEVEL: LogLevel = "info";

// A Map, so a JavaScript caller's `"constructor"` finds no level and `["debug"]` is never coerced into one.
export const SEVERITY_NUMBERS = new Map<unknown, number>(Object.entries(LogLevels).map(([logLevel, { severityNumber }]) => [logLevel, severityNumber]));
