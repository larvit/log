# Changelog

## Unreleased

### Security

- Goals now say plainly which text this library will never clean for you: the log message,
  metadata, `context`, `spanName`, and a header or query value you allow-list that simply *is* a
  secret. Nothing exported has changed — `spanName` has always gone out as you wrote it — but if
  you build one from a request url (`spanName: "GET " + req.url`), its credentials reach your
  tracing backend, in the span name, the scope name and, under `printTraceInfo`, your console; a
  child log inherits the name, so one such `spanName` labels the whole trace. Name the route, not
  the url.
- Not fixed, and still exporting on every such call until it is: a url nested in the request **path**
  reaches `url.full` as you wrote it. `url.full` is built from the origin and the path, and only
  the query is redacted, so
  `log.fetch("https://proxy.test/fetch/https://user:pass@cb.test/x")` — the shape a fetch-through
  proxy, a CORS or image proxy or a webhook replay endpoint takes — exports that password to your
  tracing backend with no capture option involved, which means you cannot rule yourself out by
  reading your capture config. Percent-encoding it changes nothing. It is deferred rather than
  unfixable: a path is not a value, so neither redaction rule in the next bullet transfers cleanly.
  **Rotate any credential you have passed inside a url nested in a path.** The `@`, `%40` and
  `%2540` search in the next bullet finds its userinfo. Its query — where a signed url keeps
  `X-Amz-Signature`, `sig` or `access_token` — reaches the path only percent-encoded, so also search
  `url.full` for `%3F` and `%253F`, upper or lower case, and for `aHR0c`, which begins a
  base64-encoded url. Rotate any token a hit holds; a SigV4 one not base64-encoded also holds
  `aws4_request` and follows the presigned-url bullet below, `captureQuery` or not. `log.fetch` first exported
  `url.full` in v2.3.0, so no older span carries it.
- A header you allow-list is no longer a way to export a credential: `authorization`,
  `proxy-authorization`, `cookie` and `set-cookie` named in `captureRequestHeaders` or
  `captureResponseHeaders` record `REDACTED`, so the span still shows the header was there. Any
  other captured header value records `REDACTED` too where it holds url userinfo — a `referer` or a
  `location` carrying an OAuth `redirect_uri` — and with `captureQuery` on so does a query value,
  where matching only the key left `?next=https://user:pass@host/x` exporting the password, as does
  a query key, so a credentialed url written as a bare key records as a parameter named `REDACTED`.
  It sees through one layer of percent-encoding but not two; a second layer still gets past it. A
  value merely shaped like a credential goes the same way: a `location` of
  `https://cdn.test//logo@2x.png` records `REDACTED` whole. What it does not reach is a header or
  query value that simply *is* a secret — `x-api-key`, your own signed token — which is exported as
  you sent it, so don't allow-list one.
  **Rotate any credential you named one of those four headers for, or put in a url you captured in
  a header or a query string**: search each header you allow-listed, under
  `http.request.header.*` and `http.response.header.*`, for those four names, and search those same
  attributes and `url.full` for `@`, `%40` or `%2540`.
- With `captureQuery` on, a presigned SigV4 url — S3 or any S3-compatible store — exported its
  `X-Amz-Signature`, the access key id in `X-Amz-Credential` and the session token in
  `X-Amz-Security-Token` in `url.full`; a GCS url exported the service account's email in
  `X-Goog-Credential` or `GoogleAccessId`, its signature already redacted. All five now record
  `REDACTED`; every other parameter is kept. A GCS url needs nothing: an email leaked and no
  signature did. **On v2.3.0 or later with `captureQuery` on, act on every leaked SigV4 url that has
  not expired**: it is replayable until its `X-Amz-Date` plus `X-Amz-Expires`, both still in
  `url.full`, has passed, and the signature, key id and session token alone reveal no secret, so an
  expired one needs nothing. Search `url.full` for `aws4_request`, which every leaked
  `X-Amz-Credential` ends in and a redacted one never holds; on S3 itself no presigned url outlives
  seven days, so only the last week's spans can hold a live one. For a live hit, a credential
  starting `ASIA` is temporary, and the url died with that session whatever `X-Amz-Expires` says:
  revoke the role's active sessions only if it may still be open. Any other is a long-term key:
  rotate it.
- A span's status message no longer carries url credentials: userinfo in a url the message quotes
  is exported as `http://REDACTED@host/x`. On Node and in browsers `fetch` refuses a url carrying
  credentials and quotes the whole url into its `TypeError`, which reached the backend both as the
  `log.fetch` span's own status and, once you caught that rejection and forwarded it, as
  `end({ error })` on the span around it. The rejection reaching the caller is unchanged;
  `log.span.status.message` now shows the redacted text, and `error.type` is untouched. Nothing to
  rotate: no released version exported a span status message at all — `end()` took no argument and
  `OtlpSpan.status` had no `message` — so both routes exist only alongside their own redaction.
- Not fixed: on React Native, whose `fetch` is an `XMLHttpRequest` polyfill,
  `log.fetch("https://user:pass@host/x")` reaches the platform with the credentials still in the
  url, where Node and browsers refuse it outright. On iOS the URL loading system answers the
  server's `WWW-Authenticate` challenge with them, so they go on the wire; on Android OkHttp sends
  no credentials and hands you the 401, except through a plain-`http:` proxy, whose request line
  carries the whole url. `log.fetch` mirrors whatever the runtime does, so it cannot close this.
  Nothing about it reaches your tracing backend — `url.full` never holds the outer url's userinfo —
  so there is nothing to rotate on account of this platform difference; the exposure is the network path to the host, in
  the clear if that url is `http:`. Pass an `Authorization` header, and strip userinfo from a url
  you did not build.
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

### Everything else

- A failed export no longer holds a Node or Deno process open. A record logged while the failing
  round was in flight scheduled a batch send of its own that the retry backoff did not take over,
  so the process stayed alive for up to `batchDelayMs` after `await log.flush()` or
  `await log.end()` had already returned.
- With `captureQuery` on, a query key that repeats keeps every occurrence in `url.full`. A repeated
  known-sensitive key — `?Signature=a&Signature=b` — used to collapse to one `REDACTED`.
- An `otlpHttpBaseURI` that is not `http:` or `https:` is rejected in the constructor, where
  `otlp:collector.example.com` used to build a queue that could never export. Written without
  `//`, such a URI parses to an opaque path, which put any `user:pass@` in it straight back into
  the reported url.
- A header in `otlpAdditionalHeaders` replaces the one the queue sets itself whatever its casing,
  and is read afresh on each send, so a rotated token takes effect. A name or value the runtime
  rejects drops that batch, reported as `OTLP export headers invalid, batch dropped` naming the
  header, never its value.
- `format` also takes a formatter function, `(entry) => string`, and is what children and clones
  inherit. New export: `EntryFormatter`; `ResolvedLogConf["format"]` widens to include a function.
  The `entryFormatter` option is deprecated: it still formats and still wins over a
  `"text"`/`"json"` `format`, writes one `warn` line per `stderr` sink for each distinct warning
  text whatever `logLevel` says, and 3.0.0 removes it. Two different formatters, one per spelling,
  throw.
- `log.conf.entryFormatter` is deprecated too. Reading it still returns the formatter and writing
  it still swaps it — through `format` now, so the two names cannot disagree — and either warns
  once per `stderr` sink. Read `log.conf.format` instead. It is non-enumerable now, so
  `{ ...log.conf }` and `Object.keys(log.conf)` no longer carry it, which is what lets a `format`
  on a child apply; `ResolvedLogConf` still declares it, so
  `const c: ResolvedLogConf = { ...log.conf }` compiles and `c.entryFormatter(entry)` throws at
  runtime. 3.0.0 removes the member with the property.
- `JSON.stringify(log.conf)` carries `format`, `"text"` by default, where v2.3.0 left the key
  absent unless you passed one — and omits it when you passed a function, as it omits any function.
  Not promised; see below.
- A `format` set on a child (`parentLog`) now applies; before, the parent's resolved formatter
  silently kept winning. `log.conf.format` is read where a line is written, so writing it swaps
  the formatter on a live instance.
- Copy an instance's settings with `clone()`. What a spread or `JSON.stringify` of
  `log.conf` carries is not part of the semver promise and may change in a minor.
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
