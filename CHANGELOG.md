# Changelog

## Unreleased

- `MetadataValue` accepts `undefined`; such keys are dropped from console, custom-formatter and OTLP
  output, so `{ port: options.port }` with an optional field type-checks. Formatters and `log.context`
  are typed with the new `DefinedMetadata`, so existing narrowing on their values still compiles.
- `log.enabled(level)`: `true` when a call at that level would output, so a caller can skip building
  expensive metadata.
- Exported `Logger` type: the six level methods plus `enabled`. `LogInt` is `Logger` plus `conf`,
  `end`, `fetch`, `span` and `traceparent`. Libraries accept `Logger`; `parentLog` takes `LogInt`.

## v2.3.0

- `log.fetch(input, init?)`: a drop-in `fetch` that records an OTel client span under the log's span,
  injects a W3C `traceparent` header and sets the HTTP semantic-convention attributes. The query
  string is dropped from `url.full` unless `captureQuery`; headers are recorded only through the
  `captureRequestHeaders`/`captureResponseHeaders` allow-lists; bodies are never captured. 4xx/5xx
  and thrown errors mark the span errored. Spans export in the background and flush on `end()`.
- `traceparent` option: adopt an incoming trace and nest under its span; malformed values are ignored.
- `log.traceparent()` returns the current context as a header value.
- Exported `parseTraceparent` and `formatTraceparent`.

## v2.2.0

- `otlpProtocol: "http/protobuf"` exports over HTTP/protobuf; default stays `"http/json"`. Both POST
  to the same endpoint. The encoder is built in, so the library stays dependency-free.
- Fixed: `clone()` now inherits `otlpHttpBaseURI`, `otlpProtocol`, `otlpAdditionalHeaders` and
  `printTraceInfo`. A clone is still its own span, not a child of the original.

## v2.1.0

- `Metadata` values may be `number` or `boolean` as well as `string`; new exported `MetadataValue`
  type. OTLP receives the stringified form (`{ count: 5 }` → `"5"`); the JSON formatter keeps it native.
- Browsers are a tested target: the suite runs in Chromium in CI alongside the Node matrix.
- Package `exports` map, `types` and `sideEffects: false`.
- Test tooling: `tape`/`tap-spec`/`express`/`ts-node` replaced with a built-in TAP harness and a
  `fetch` stub. `npm install` pins exact versions.
- All tests run inside Docker with dependencies installed in the container.

## v2.0.0

- **Breaking:** requires Node.js 18 or later; the OTLP transport uses the global `fetch`.
- **Breaking:** removed the unused options `otlpExportTimeoutMillis`, `otlpMaxExportBatchSize`,
  `otlpMaxQueueSize`, `otlpScheduledDelayMillis`.
- `end()` returns a `Promise`; `await log.end()` guarantees delivery before exit.
- Fixed: OTLP logs set `service.name` and `telemetry.sdk.*` on the resource, so Grafana/Loki shows
  the service for logs as well as traces.
- Fixed: a base path in `otlpHttpBaseURI` is kept (`http://host/otel` → `http://host/otel/v1/logs`).
- `printTraceInfo` implemented (was a no-op).
- Span/trace ids use `crypto.getRandomValues` when available; `msgJsonFormatter` no longer mutates
  caller metadata or throws on undefined metadata; fixed inverted `verbose`/`debug` ordering.
- Tooling: yarn replaced with npm.
