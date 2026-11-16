// Runs the compiled test suite (.tmp/test) inside each of Chromium, Firefox and WebKit and reports the results.
// Intended to run inside the official Playwright Docker image (browsers preinstalled), so it
// never depends on the local OS or a locally installed browser. release-tooling/test-browser.mjs starts it.

import { createServer } from "node:http";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";

import { chromium, firefox, webkit } from "playwright";

const testDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".tmp", "test");
const mimeByExt = { ".js": "text/javascript", ".json": "application/json", ".map": "application/json" };
const indexHtml = "<!doctype html><meta charset=\"utf-8\"><script type=\"module\" src=\"/tests/test.js\"></script>";

// Static server for the compiled ESM so the browser can resolve the relative imports (./index.js etc).
const server = createServer(async (req, res) => {
	try {
		const path = (req.url ?? "/").split("?")[0];

		if (path === "/") {
			res.writeHead(200, { "content-type": "text/html" });
			res.end(indexHtml);

			return;
		}

		// Resolve against testDir and confirm the result stays inside it (no traversal / absolute escape).
		const filePath = resolve(testDir, `.${path}`);

		if (filePath !== testDir && !filePath.startsWith(testDir + sep)) {
			throw new Error("path traversal");
		}

		const body = await readFile(filePath);

		res.writeHead(200, { "content-type": mimeByExt[extname(filePath)] ?? "application/octet-stream" });
		res.end(body);
	} catch {
		res.writeHead(404);
		res.end("not found");
	}
});

await new Promise(ready => server.listen(0, "127.0.0.1", ready));
const { port } = server.address();

// Each engine runs the whole suite; the run fails when any engine fails or does not finish.
async function runSuite(engine) {
	const browser = await engine.launch();
	const page = await browser.newPage();
	const pageErrors = [];

	page.on("console", msg => console.log(msg.text()));
	page.on("pageerror", err => pageErrors.push(err));

	try {
		await page.goto(`http://127.0.0.1:${port}/`);
		// Fail fast on a page error (e.g. the bundle failing to load) instead of waiting out the timeout.
		await Promise.race([
			page.waitForFunction(() => globalThis.__tap !== undefined, undefined, { timeout: 60000 }),
			new Promise((_resolve, reject) => page.once("pageerror", reject)),
		]);

		return await page.evaluate(() => globalThis.__tap);
	} catch (err) {
		console.error("Browser run failed:", err?.message ?? err);
		pageErrors.forEach(pageError => console.error(pageError.stack ?? pageError.message));
	} finally {
		await browser.close();
	}
}

let failed = false;

for (const engine of [chromium, firefox, webkit]) {
	const result = await runSuite(engine);

	if (result) {
		console.log(`\n${engine.name()} tests: ${result.pass}/${result.total} passed, ${result.fail} failed`);
	}

	failed ||= !result || result.fail > 0;
}

server.close();
process.exit(failed ? 1 : 0);
