// Minimal TAP harness that runs identically in Node and browsers (no Node-only deps),
// so the exact same suite can run server-side and in a real browser. Replaces tape/tap-spec.
//
// Node: sets process.exitCode (1 on any failure). Browser: exposes globalThis.__tap so the
// Playwright runner can read the result. TAP lines go to console (captured in both runtimes).

export type TestFn = (t: Assertions) => void | Promise<void>;

export interface Assertions {
	comment(msg: string): void;
	deepEqual(actual: unknown, expected: unknown, msg?: string): void;
	doesNotThrow(cb: () => void, msg?: string): void;
	end(): void;
	fail(msg?: string): void;
	notOk(value: unknown, msg?: string): void;
	notStrictEqual(actual: unknown, expected: unknown, msg?: string): void;
	ok(value: unknown, msg?: string): void;
	strictEqual(actual: unknown, expected: unknown, msg?: string): void;
	throws(cb: () => void, msg?: string): void;
}

// A hung async test must fail fast rather than hang the Node run (the browser run also has its own
// Playwright timeout). Keep this comfortably above any real test and below that Playwright timeout.
const TEST_TIMEOUT_MS = 10000;

const tests: { cb: TestFn, name: string }[] = [];
let scheduled = false;
let count = 0;
let failed = 0;

function print(line: string): void {
	console.log(line);
}

function assert(pass: boolean, msg: string, detail?: string): void {
	count++;
	if (pass) {
		print(`ok ${count} - ${msg}`);
	} else {
		failed++;
		print(`not ok ${count} - ${msg}`);
		if (detail !== undefined) {
			print(`  --- ${detail}`);
		}
	}
}

function deepEq(left: unknown, right: unknown): boolean {
	if (left === right) {
		return true;
	}
	if (typeof left !== "object" || typeof right !== "object" || left === null || right === null) {
		return false;
	}
	if (Array.isArray(left) !== Array.isArray(right)) {
		return false;
	}

	const leftKeys = Object.keys(left);
	const rightKeys = Object.keys(right);

	if (leftKeys.length !== rightKeys.length) {
		return false;
	}

	return leftKeys.every(key => {
		// Same length is not enough: both sides must hold the same keys, else a missing key reads as
		// undefined and a {a:undefined} vs {b:undefined} pair would wrongly compare equal.
		if (!Object.prototype.hasOwnProperty.call(right, key)) {
			return false;
		}

		return deepEq((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key]);
	});
}

const t: Assertions = {
	comment: msg => print(`# ${msg}`),
	deepEqual: (actual, expected, msg = "should be deep-equal") =>
		assert(deepEq(actual, expected), msg, `got ${JSON.stringify(actual)} want ${JSON.stringify(expected)}`),
	doesNotThrow: (cb, msg = "should not throw") => {
		try {
			cb();
			assert(true, msg);
		} catch (err) {
			assert(false, msg, String(err));
		}
	},
	end: () => { /* completion is detected when the test function returns/resolves */ },
	fail: (msg = "fail") => assert(false, msg),
	notOk: (value, msg = "should be falsy") => assert(!value, msg, `got ${JSON.stringify(value)}`),
	notStrictEqual: (actual, expected, msg = "should differ") => assert(actual !== expected, msg),
	// eslint-disable-next-line id-length -- "ok" mirrors tape's assertion name
	ok: (value, msg = "should be truthy") => assert(!!value, msg, `got ${JSON.stringify(value)}`),
	strictEqual: (actual, expected, msg = "should be strictly equal") =>
		assert(actual === expected, msg, `got ${JSON.stringify(actual)} want ${JSON.stringify(expected)}`),
	throws: (cb, msg = "should throw") => {
		try {
			cb();
			assert(false, msg);
		} catch {
			assert(true, msg);
		}
	},
};

function rejectAfterTimeout(): Promise<never> {
	return new Promise((_resolve, reject) => {
		const timer = setTimeout(() => reject(new Error(`timed out after ${TEST_TIMEOUT_MS}ms`)), TEST_TIMEOUT_MS);

		// Don't let a pending timeout keep the Node process alive once the tests are done.
		(timer as { unref?: () => void }).unref?.();
	});
}

async function run(): Promise<void> {
	print("TAP version 13");

	// Tests run serially; suites that stub globals (e.g. fetch) rely on this. We snapshot and
	// restore globalThis.fetch around each test so a throwing test can never leak its stub.
	for (const { cb, name } of tests) {
		const savedFetch = globalThis.fetch;

		print(`# ${name}`);
		try {
			await Promise.race([cb(t), rejectAfterTimeout()]);
		} catch (err) {
			assert(false, `${name} threw`, String(err));
		} finally {
			globalThis.fetch = savedFetch;
		}
	}

	print(`1..${count}`);
	print(`# tests ${count}`);
	print(`# pass ${count - failed}`);
	print(`# fail ${failed}`);

	(globalThis as { __tap?: unknown }).__tap = { fail: failed, pass: count - failed, total: count };

	if (typeof process !== "undefined") {
		process.exitCode = failed ? 1 : 0;
	}
}

export default function test(name: string, cb: TestFn): void {
	tests.push({ cb, name });

	if (!scheduled) {
		scheduled = true;
		// Defer so every synchronous test() registration is collected before the run starts.
		// Guard the run itself so an unexpected throw still surfaces as a failure, never a false pass.
		queueMicrotask(() => {
			void run().catch(err => {
				console.error(err);
				(globalThis as { __tap?: unknown }).__tap = { fail: 1, pass: 0, total: 1 };
				if (typeof process !== "undefined") {
					process.exitCode = 1;
				}
			});
		});
	}
}
