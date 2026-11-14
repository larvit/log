// @ts-check
/** @type {import("@stryker-mutator/api/core").PartialStrykerOptions} */
export default {
	mutate: ["index.ts", "{credentials,log,otlp,primitives,tracing}/**/*.ts"],
	// tsc type-checks the build, and a mutant often doesn't type-check.
	disableTypeChecks: "{index,{credentials,log,otlp,primitives,tracing}/**/*}.ts",
	// The suite runs against the built bundle, so the sandbox builds it once with every mutant in it,
	// and each run switches one on.
	buildCommand: "npm run build-tests",
	testRunner: "command",
	commandRunner: { command: "npm run test-node" },
	coverageAnalysis: "off",
	// Four suites fit in the 4 GiB `npm run test-mutation` gives its container. The command runner
	// counts a suite killed for memory as a killed mutant, so more would hide survivors.
	concurrency: 4,
};
