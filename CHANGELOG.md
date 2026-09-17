# Changelog

## Unreleased

- `colors: false` turns off the ANSI colour codes in text output. Inherited by children and clones.
  Formatters receive the setting as `EntryFormatterConf.colors`; `msgTextFormatter` colours unless
  it is `false`.
- Export queue. Records and spans are batched into one POST per path, by time (1 s) or size (64 KiB),
  sent with `keepalive` and retried with backoff on a network error, timeout, 408, 429 or 5xx; other
  non-2xx drops the batch. One stderr line per failed attempt. Bounded at 1000 items, oldest dropped
  and the count reported once. `otlpHttpBaseURI` builds the default `Queue`, shared by children and
  clones; `otlpQueue` takes your own, e.g. `new Queue({ otlpHttpBaseURI, storage: AsyncStorage })`
  to survive an app restart. `log.flush()` delivers without ending; `end()` flushes after closing
  the span. New exports: `Queue`, `OtlpQueue`, `OtlpPayload`, `QueueConf`, `ResolvedQueueConf`,
  `QueueStorage`.
- `end({ error })` marks the instance's span failed: status `ERROR` with the error's message, and an
  `error.type` span attribute from the error's `code`, else `name`. `log.error()` does not mark the
  span. `OtlpSpan.status` gains an optional `message`. A `log.fetch` span that failed with a thrown
  error now carries the same status message, and its `error.type` fallback is the OpenTelemetry
  `_OTHER` instead of `fetch_error`.
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
