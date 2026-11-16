// The process global's env, or undefined where there is none (browsers) or a permission-gated one throws.
export function processEnv(): unknown {
	try {
		const processGlobal: unknown = Reflect.get(globalThis, "process");

		return typeof processGlobal === "object" && processGlobal !== null ? Reflect.get(processGlobal, "env") : undefined;
	} catch {
		return undefined;
	}
}

// Whether the process global's stdout is a terminal: true there, else false or undefined, and undefined where there is no process.
export function stdoutIsTTY(scope: object = globalThis): unknown {
	try {
		const processGlobal: unknown = Reflect.get(scope, "process");
		const stdout: unknown = typeof processGlobal === "object" && processGlobal !== null ? Reflect.get(processGlobal, "stdout") : undefined;

		return typeof stdout === "object" && stdout !== null ? Reflect.get(stdout, "isTTY") : undefined;
	} catch {
		return undefined;
	}
}
