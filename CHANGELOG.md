# Changelog

## Unreleased

- Not fixed: on React Native, whose `fetch` is an `XMLHttpRequest` polyfill,
  `log.fetch("https://user:pass@host/x")` may put those credentials on the wire where Node and
  browsers refuse the url outright. `log.fetch` mirrors whatever the runtime does, so it cannot
  close this. Pass an `Authorization` header, and strip userinfo from a url you did not build.
- A span's status message no longer carries url credentials: userinfo in a url the message quotes
  is exported as `http://REDACTED@host/x`. On Node and in browsers `fetch` refuses a url carrying
  credentials and quotes the whole url into its `TypeError`, which reached the backend both as the
  `log.fetch` span's own status and, once you caught that rejection and forwarded it, as
  `end({ error })` on the span around it. The rejection reaching the caller is unchanged, and
  `url.full` never held them.
  **If you have called `log.fetch` with a `user:pass@` url on Node or in a browser, rotate those
  credentials**: they are in your tracing backend, on every span whose status message quotes the
  url.
- `log.fetch` traces only a URL that resolves to `http:` or `https:`; anything else is fetched
  untraced — no span, and no `traceparent` sent. It used to export a span whose `url.full` held
  whatever the url did: written without `//`, a url parses to an opaque path, so
  `log.fetch("myapp:user:pass@host/x")` exported `nulluser:pass@host/x` and a `data:` url exported
  its whole payload. **If you have passed credentials or private data in such a url, rotate them**:
  search your tracing backend for spans whose `url.full` starts with `null`.
- Credentials in `otlpHttpBaseURI` no longer reach `stderr`, and basic auth works. `fetch` rejects
  a `user:pass@` url outright on Node and in browsers, and that rejection quoted the whole url —
  credentials included — into the error line of every failed export. `user:pass@` is now sent as an
  `Authorization: Basic` header, percent-decoded, and the request url carries none.
  **If you have ever set `user:pass@` in `otlpHttpBaseURI`, rotate those credentials**: they are in
  whatever collects your `stderr`, findable by searching it for your collector's hostname. The URI
  stays on `log.conf` and `queue.conf` as you gave it, so don't log your `conf`. Percent-encode any
  `/ ? #` in a password, and a literal `%` as `%25`.
- An `otlpHttpBaseURI` that is not `http:` or `https:` is rejected in the constructor, where
  `otlp:collector.example.com` used to build a queue that could never export. Written without
  `//`, such a URI parses to an opaque path, which put any `user:pass@` in it straight back into
  the reported url.
- A header in `otlpAdditionalHeaders` replaces the one the queue sets itself whatever its casing,
  and is read afresh on each send, so a rotated token takes effect. A name or value the runtime
  rejects drops that batch, reported as `OTLP export headers invalid, batch dropped` naming the
  header, never its value.
- `format` also takes a formatter function, `(entry) => string`, and is what children and clones
  inherit. `entryFormatter` is deprecated: it still formats and still wins over a `"text"`/`"json"`
  `format`, writes one `warn` line per `stderr` sink for each distinct warning text, whatever
  `logLevel` says, and 3.0.0 removes it. Two different formatters, one per spelling, throw. New
  export: `EntryFormatter`; `ResolvedLogConf["format"]` widens to include a function, and
  `log.conf.entryFormatter` is now non-enumerable, so it no longer shows up in a spread or
  `Object.keys` of the conf. A `format` function drops out of `JSON.stringify(log.conf)`, as any
  function does, where the string always showed.
- A `format` set on a child (`parentLog`) or on a spread of `log.conf` now applies; before, the
  parent's resolved formatter silently kept winning.
- Every deprecation line names the package: `@larvit/log: …`.
- The level-string shorthand, `new Log("debug")` and `log.clone("debug")`, is deprecated: it still
  sets the level, writes one `warn` line per `stderr` sink for each distinct warning text,
  whatever `logLevel` says, and 3.0.0 removes it. Pass `{ logLevel }` instead.
- `clock` option on `Log` and `Queue`: `{ now, setTimeout, clearTimeout }` behind every span and
  record timestamp and behind the queue's batch, retry and send-timeout timers, so a test drives
  time instead of waiting on it. Defaults to the system clock, inherited by children and clones.
  New exports: `Clock`, `TimerHandle`.
- The constructor and `clone()` no longer write defaults, inherited settings or the built `Queue`
  into the options object they are given, so one object reused for several instances no longer
  makes them share a queue.
- An incoming `traceparent` with the sampled flag off is honoured: the instance and its children
  export no records or spans, and `log.traceparent()` and `log.fetch` pass `00` downstream. Console
  output is unchanged. New `log.sampled` field, on `LogInt`; `parseTraceparent` returns `sampled`
  and rejects version `ff`.
- Any 2xx is JSON export success; before, a body other than `{}` or `{"partialSuccess":{}}` was
  reported as a rejection. A `partialSuccess` with a rejected count is reported through `report`
  as `OTLP export partially rejected`, with `rejected` and the collector's `errorMessage` as `error`.
- `colors: false` turns off the ANSI colour codes in text output. Unset in code, `NO_COLOR`
  (non-empty) turns it off; otherwise `FORCE_COLOR` turns it on, except `0` or `false` which turn
  it off. A value set in code wins over both. Inherited by children and clones. Formatters receive the setting as `EntryFormatterConf.colors`; `msgTextFormatter`
  colours unless it is `false`.
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
