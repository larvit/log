type Metadata = {
	[key: string]: string;
}

type LogShorthand = (msg: string, metadata?: Metadata) => void;

interface LogInt {
	error: LogShorthand;
	warn: LogShorthand;
	info: LogShorthand;
	verbose: LogShorthand;
	debug: LogShorthand;
	silly: LogShorthand;
}

type LogLevel = keyof LogInt;

type EntryFormatterConf = {
	logLevel: LogLevel;
	metadata?: Metadata;
	msg: string;
}

type LogConf = {
	context?: Metadata;
	format?: "text" | "json";
	logLevel?: LogLevel | "none";
	entryFormatter?: (conf: EntryFormatterConf) => string;
	stdout?: (msg: string) => void;
	stderr?: (msg: string) => void;
}

export function msgJsonFormatter(conf: EntryFormatterConf) {
	const payload = Object.assign(conf.metadata, {
		time: (new Date()).toISOString(),
		logLevel: conf.logLevel,
		msg: conf.msg,
	});
	return JSON.stringify(payload);
}

export function msgTextFormatter(conf: EntryFormatterConf) {
	let levelOut = "";

	if (conf.logLevel === "silly") {
		levelOut = '\x1b[1;37msil\x1b[0m';
	} else if (conf.logLevel === "debug") {
		levelOut = '\x1b[1;35mdeb\x1b[0m';
	} else if (conf.logLevel === "verbose") {
		levelOut = '\x1b[1;34mver\x1b[0m';
	} else if (conf.logLevel === "info") {
		levelOut = '\x1b[1;32minf\x1b[0m';
	} else if (conf.logLevel === "warn") {
		levelOut = '\x1b[1;33mwar\x1b[0m';
	} else if (conf.logLevel === "error") {
		levelOut = '\x1b[1;31merr\x1b[0m';
	} else {
		throw new Error(`Invalid conf.logLevel: "${conf.logLevel}"`);
	}

	let str = `${(new Date()).toISOString().substring(0, 19)}Z [${levelOut}] ${conf.msg}`;
	const metadataStr = JSON.stringify(conf.metadata);
	if (metadataStr !== "{}") {
		str += ` ${JSON.stringify(conf.metadata)}`;
	}
	return str;
}

export class Log implements LogInt {
	context: Metadata;
	readonly #logLevel: LogLevel | "none";
	readonly #entryFormatter: (conf: EntryFormatterConf) => string;
	readonly #stderr: (msg: string) => void;
	readonly #stdout: (msg: string) => void;

	constructor(conf?: LogConf | LogLevel | "none") {
		if (conf === undefined) {
			conf = {};
		} else if (typeof conf === "string") {
			conf = { logLevel: conf };
		}

		if (conf.logLevel === undefined) {
			conf.logLevel = "info";
		}

		if (conf.entryFormatter !== undefined) {
			conf.entryFormatter = conf.entryFormatter;
		} else if (conf.format === "json") {
			conf.entryFormatter = msgJsonFormatter;
		} else {
			conf.entryFormatter = msgTextFormatter;
		}

		if (conf.stderr === undefined) {
			conf.stderr = console.error;
		}

		if (conf.stdout === undefined) {
			conf.stdout = console.log;
		}

		this.#logLevel = conf.logLevel;
		this.#entryFormatter = conf.entryFormatter;
		this.#stderr = conf.stderr;
		this.#stdout = conf.stdout;
		this.context = conf.context || {};
	}

	error(msg: string, metadata?: Metadata) {
		if (this.#logLevel === "none") return;
		this.#stderr(this.#entryFormatter({ logLevel: "error", msg, metadata: Object.assign(metadata || {}, this.context)}));
	}

	warn(msg: string, metadata?: Metadata) {
		if (["none", "error"].includes(this.#logLevel)) return;
		this.#stderr(this.#entryFormatter({ logLevel: "warn", msg, metadata: Object.assign(metadata || {}, this.context)}));
	}

	info(msg: string, metadata?: Metadata) {
		if (["none", "error", "warn"].includes(this.#logLevel)) return;
		this.#stdout(this.#entryFormatter({ logLevel: "info", msg, metadata: Object.assign(metadata || {}, this.context)}));
	}

	verbose(msg: string, metadata?: Metadata) {
		if (["none", "error", "warn", "info"].includes(this.#logLevel)) return;
		this.#stdout(this.#entryFormatter({ logLevel: "verbose", msg, metadata: Object.assign(metadata || {}, this.context)}));
	}

	debug(msg: string, metadata?: Metadata) {
		if (["none", "error", "warn", "info", "verbose"].includes(this.#logLevel)) return;
		this.#stdout(this.#entryFormatter({ logLevel: "debug", msg, metadata: Object.assign(metadata || {}, this.context)}));
	}

	silly(msg: string, metadata?: Metadata) {
		if (["none", "error", "warn", "info", "verbose", "debug"].includes(this.#logLevel)) return;
		this.#stdout(this.#entryFormatter({ logLevel: "silly", msg, metadata: Object.assign(metadata || {}, this.context)}));
	}
}
