// Runs the compiled test suite (.tmp/test) inside a real browser and reports the result.
// Intended to run inside the official Playwright Docker image (browsers preinstalled), so it
// never depends on the local OS or a locally installed Chromium. See package.json "test-browser".

import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

const testDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".tmp", "test");
const mimeByExt = { ".js": "text/javascript", ".json": "application/json", ".map": "application/json" };
const indexHtml = "<!doctype html><meta charset=\"utf-8\"><script type=\"module\" src=\"/test.js\"></script>";

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

const browser = await chromium.launch();
const page = await browser.newPage();
const pageErrors = [];

page.on("console", msg => console.log(msg.text()));
page.on("pageerror", err => pageErrors.push(err));

let result;
try {
	await page.goto(`http://127.0.0.1:${port}/`);
	// Fail fast on a page error (e.g. the bundle failing to load) instead of waiting out the timeout.
	await Promise.race([
		page.waitForFunction(() => globalThis.__tap !== undefined, undefined, { timeout: 60000 }),
		new Promise((_resolve, reject) => page.once("pageerror", reject)),
	]);
	result = await page.evaluate(() => globalThis.__tap);
} catch (err) {
	console.error("Browser run failed:", err?.message ?? err);
	pageErrors.forEach(pageError => console.error(pageError.stack ?? pageError.message));
} finally {
	await browser.close();
	server.close();
}

if (!result) {
	process.exit(1);
}

console.log(`\nBrowser tests: ${result.pass}/${result.total} passed, ${result.fail} failed`);
process.exit(result.fail > 0 ? 1 : 0);
