// `npm run test-otlp`: builds index.js in the test image, so the collector sees the code CI ships,
// then runs e2e-tests/run-otlp-tests.mjs against it. Needs Docker and Node on the host.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const IMAGE = "larvit-log-test-node";

execFileSync("docker", ["build", "-t", IMAGE, "."], { stdio: "inherit" });
const built = execFileSync("docker", ["run", "--rm", "--memory", "4g", "--memory-swap", "4g", IMAGE, "sh", "-c", "npm run build >/dev/null && cat index.js"], { maxBuffer: 64 * 1024 * 1024 });

writeFileSync("index.js", built);
execFileSync("node", ["e2e-tests/run-otlp-tests.mjs"], { stdio: "inherit" });
