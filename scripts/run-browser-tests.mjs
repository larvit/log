// Runs the compiled test suite (.tmp/test) inside a real browser and reports the result.
// Intended to run inside the official Playwright Docker image (browsers preinstalled), so it
// never depends on the local OS or a locally installed Chromium. See package.json "test-browser".

import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

const testDir = join(dirname(fileURLToPath(import.meta.url)), "..", ".tmp", "test");
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

		const safe = normalize(decodeURIComponent(path)).replace(/^(\.\.[/\\])+/, "");
		const body = await readFile(join(testDir, safe));

		res.writeHead(200, { "content-type": mimeByExt[extname(safe)] ?? "application/octet-stream" });
		res.end(body);
	} catch {
		res.writeHead(404);
		res.end("not found");
	}
});

await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();

const browser = await chromium.launch();
const page = await browser.newPage();

page.on("console", msg => console.log(msg.text()));
page.on("pageerror", err => console.error("PAGE ERROR:", err.stack ?? err.message));

let result;
try {
	await page.goto(`http://127.0.0.1:${port}/`);
	await page.waitForFunction(() => globalThis.__tap !== undefined, undefined, { timeout: 30000 });
	result = await page.evaluate(() => globalThis.__tap);
} finally {
	await browser.close();
	server.close();
}

console.log(`\nBrowser tests: ${result.pass}/${result.total} passed, ${result.fail} failed`);
process.exit(result.fail > 0 ? 1 : 0);
