// End-to-end OTLP verification. Drives the library against a real OpenTelemetry Collector and asserts
// the collector parsed our output — over BOTH http/json and http/protobuf — into the expected
// telemetry. The collector is the OTLP reference implementation, so this validates the hand-rolled
// protobuf encoder against the spec itself, a stronger oracle than the in-suite decoder.
//
// Needs Docker + Node. Run via `npm run test-otlp` (builds index.js first). OTLP_CONTAINER, OTLP_IMAGE and
// OTLP_PORT override the container name, the collector image and the host port, so a second run takes
// its own. The default image is pinned to an exact version for reproducibility.

import assert from "node:assert/strict";
import { chmod, mkdir, readFile, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { execFile as execFileCb } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { Log, otlpTransport } from "../index.js";

const execFile = promisify(execFileCb);

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
// `||`, not `??`: an empty variable takes the default, since an empty container name would leave
// the collector running under a random name that `removeContainer` never finds.
const CONTAINER = process.env.OTLP_CONTAINER || "larvit-log-otlp-verify";
const IMAGE = process.env.OTLP_IMAGE || "otel/opentelemetry-collector-contrib:0.154.0";
const PORT = process.env.OTLP_PORT || "4318";
const ENDPOINT = `http://127.0.0.1:${PORT}`;
const CONFIG = resolve(SCRIPT_DIR, "otel-collector-config.yaml");
// Host dir mounted into the container at /data; the collector's file exporter writes here and the
// test reads it back. The contrib image is distroless (no /tmp, no shell), so a mount is required.
const DATA_DIR = resolve(SCRIPT_DIR, "..", ".tmp", "otlp");
const RECEIVED = resolve(DATA_DIR, "otlp-received.json");

const PROTOCOLS = [["http/json", "verify-json"], ["http/protobuf", "verify-protobuf"]];

const sleep = millis => new Promise(done => setTimeout(done, millis));
const docker = (args, opts = {}) => execFile("docker", args, opts);

// The library's console output (incl. any OTLP export errors) is buffered and only printed on failure.
const logSink = [];

async function removeContainer() {
	try {
		await docker(["rm", "-f", CONTAINER]);
	} catch {
		// not running — fine
	}
}

async function waitUntil(label, check, { tries = 60, delayMs = 500 } = {}) {
	for (let i = 0; i < tries; i++) {
		try {
			if (await check()) return;
		} catch {
			// keep polling
		}
		await sleep(delayMs);
	}

	throw new Error(`Timed out waiting for: ${label}`);
}

// All telemetry the collector has parsed and written back, as parsed OTLP-JSON lines.
async function readReceived() {
	const raw = await readFile(RECEIVED, "utf8");

	return raw.split("\n").filter(Boolean).map(line => JSON.parse(line));
}

async function exportTelemetry(protocol, serviceName) {
	const log = new Log({
		context: { "service.name": serviceName },
		spanName: `${serviceName}-span`,
		stderr: line => logSink.push(line),
		transports: [otlpTransport({ baseUrl: ENDPOINT, protocol, report: msg => logSink.push(msg) })],
	});

	log.error(`hello over ${protocol}`, { active: true, count: 17, foo: "bar" });
	await log.end();
}

const resourceHasService = (resource, name) =>
	(resource.attributes ?? []).some(attr => attr.key === "service.name" && attr.value?.stringValue === name);

function assertLog(received, serviceName, protocol) {
	const resourceLog = received.flatMap(line => line.resourceLogs ?? []).find(batch => resourceHasService(batch.resource, serviceName));

	assert.ok(resourceLog, `[${protocol}] collector received a log for ${serviceName}`);

	assert.equal(resourceLog.scopeLogs[0].scope?.name, "@larvit/log", `[${protocol}] log scope name`);
	assert.match(resourceLog.scopeLogs[0].scope?.version ?? "", /^\d+\.\d+\.\d+/, `[${protocol}] log scope version`);

	const record = resourceLog.scopeLogs[0].logRecords[0];

	assert.equal(record.body.stringValue, `hello over ${protocol}`, `[${protocol}] log body`);
	assert.equal(record.severityText, "ERROR", `[${protocol}] log severityText`);

	const attrs = Object.fromEntries((record.attributes ?? []).map(attr => [attr.key, attr.value.stringValue]));

	assert.equal(attrs.active, "true", `[${protocol}] log attr active`);
	assert.equal(attrs.count, "17", `[${protocol}] log attr count`);
	assert.equal(attrs.foo, "bar", `[${protocol}] log attr foo`);

	return { spanId: record.spanId, traceId: record.traceId };
}

function assertSpan(received, serviceName, protocol, ids) {
	const resourceSpan = received.flatMap(line => line.resourceSpans ?? []).find(batch => resourceHasService(batch.resource, serviceName));

	assert.ok(resourceSpan, `[${protocol}] collector received a span for ${serviceName}`);

	assert.equal(resourceSpan.scopeSpans[0].scope?.name, "@larvit/log", `[${protocol}] span scope name`);
	assert.match(resourceSpan.scopeSpans[0].scope?.version ?? "", /^\d+\.\d+\.\d+/, `[${protocol}] span scope version`);

	const span = resourceSpan.scopeSpans[0].spans[0];

	assert.equal(span.name, `${serviceName}-span`, `[${protocol}] span name`);
	assert.equal(span.traceId, ids.traceId, `[${protocol}] span.traceId matches the log's traceId`);
	assert.equal(span.spanId, ids.spanId, `[${protocol}] span.spanId matches the log's spanId`);
}

try {
	await removeContainer();
	// Fresh, world-writable data dir so the container's (distroless, non-root) user can write the export.
	await rm(DATA_DIR, { force: true, recursive: true });
	await mkdir(DATA_DIR, { recursive: true });
	await chmod(DATA_DIR, 0o777);

	await docker(["run", "-d", "--name", CONTAINER, "--memory", "1g", "--memory-swap", "1g", "-p", `${PORT}:4318`, "-v", `${CONFIG}:/etc/otel-config.yaml:ro`, "-v", `${DATA_DIR}:/data`, IMAGE, "--config", "/etc/otel-config.yaml"]);

	await waitUntil("collector HTTP endpoint", async () => {
		await fetch(ENDPOINT);

		return true;
	});

	for (const [protocol, name] of PROTOCOLS) {
		await exportTelemetry(protocol, name);
	}

	let received = [];

	await waitUntil("collector to flush received telemetry", async () => {
		received = await readReceived();
		const logs = received.flatMap(line => line.resourceLogs ?? []);
		const spans = received.flatMap(line => line.resourceSpans ?? []);

		return logs.length >= PROTOCOLS.length && spans.length >= PROTOCOLS.length;
	});

	// Set OTLP_DEBUG=1 to dump exactly what the collector parsed (handy when tightening assertions).
	if (process.env.OTLP_DEBUG) console.log(JSON.stringify(received, null, 2));

	for (const [protocol, name] of PROTOCOLS) {
		const ids = assertLog(received, name, protocol);

		assertSpan(received, name, protocol, ids);
	}

	console.log(`OTLP verification passed: collector ${IMAGE} parsed both JSON and protobuf output correctly.`);
} catch (err) {
	console.error("OTLP verification FAILED:", err.message);
	if (logSink.length) console.error("library output:\n" + logSink.join("\n"));
	process.exitCode = 1;
} finally {
	await removeContainer();
}
