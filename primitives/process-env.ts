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
// Reflect.get throws on a missing process or stdout, and on a getter that throws, which the catch turns into undefined.
export function stdoutIsTTY(scope: object = globalThis): unknown {
	try {
		return Reflect.get(Reflect.get(Reflect.get(scope, "process"), "stdout"), "isTTY");
	} catch {
		return undefined;
	}
}
