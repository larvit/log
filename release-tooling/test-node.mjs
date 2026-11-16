// Runs the compiled Node suite and the OpenTelemetry adapter's suite from .tmp/test, which
// `npm run build-tests` fills. Stops at the first suite that fails.
import { execFileSync } from "node:child_process";

for (const suite of ["tests/test.js", "tests/otel-adapter.test.js"]) execFileSync("node", [`.tmp/test/${suite}`], { stdio: "inherit" });
