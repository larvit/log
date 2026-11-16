// `npm run test-otlp`: builds index.js in a test image, so the collector receives the code CI
// ships, then runs e2e-tests/run-otlp-tests.mjs on that index.js. Needs Docker and Node on the host.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

// Tagged per process, so a run in another checkout builds and runs its own image.
const IMAGE = `larvit-log-test-otlp-${process.pid}`;

try {
	execFileSync("docker", ["build", "-t", IMAGE, "."], { stdio: "inherit" });
	const built = execFileSync("docker", ["run", "--rm", "--memory", "4g", "--memory-swap", "4g", IMAGE, "sh", "-c", "npm run build >/dev/null && cat index.js"], { maxBuffer: 64 * 1024 * 1024 });

	writeFileSync("index.js", built);
	execFileSync("node", ["e2e-tests/run-otlp-tests.mjs"], { stdio: "inherit" });
} finally {
	execFileSync("docker", ["rmi", "-f", IMAGE], { stdio: "ignore" });
}
