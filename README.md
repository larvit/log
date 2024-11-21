# @larvit/log

Zero dependency, structured logging with a simple interface.

## Installation

`npm i @larvit/log` or `yarn add @larvit/log`

## Usage

```javascript
import { Log } from "@larvit/log";

const log = new Log("silly"); // Replace "silly" with the minimum log level you want. Defaults to "info"
log.error("Apocalypse! :O"); // stderr
log.warn("The chaos is near"); // stderr
log.info("All is well, but this message is important"); // stdout
log.verbose("Extra info, likely good in a production environment"); // stdout
log.debug("A lot of detailed logs to debug your application"); // stdout
log.silly("Open the flood gates!"); // stdout
```

To clone your log instance: `const log2 = log.clone();`.

### Group your logs

To get tracing, timings, spans etc you can group your logs like this example:

```javascript
import { Log } from "@larvit/log";

// Creates an outer log context
const appLog = new Log();

// Just an example on a request/response http handler that you want to log
function myRequsetHandler(req, res) {
	// Creates an inner log context for this specific request
	const reqLog = new Log({
		context: { requestId: crypto.randomUUID() },
		parentLog: appLog,
		spanName: "request",
	});

	reqLog.info("Incoming request", { url: req.url });

	// ... Here be loads of request handler logic ...

	// Explicitly tell that this inner log is now ended.
	// This is used to set timings etc.
	reqLog.end();
}

```

### Configuration

**Log level only**  
`const log = new Log("info");` Will only output error, warn and info logs. This is the default. All possible options: "error", "warn", "info", "verbose", "debug", "silly" and "none".

**All options**  
```javascript
const log = new Log({
	// All options is optional

	// Context will be appended as metadata to all log entries
	// Default is an empty context
	context: {
		key: "string",
		anotherKey: "string",
	},

	// Options are "text" and "json", "text" is the default
	format: "text",

	// Defaults to "info", same as Log level only section above
	logLevel: "info",

	// The function that formats the log entry, default is shown here
	entryFormatter: ({ logLevel, metadata, msg }) => {
		return `${logLevel}: ${msg} ${JSON.stringify(metadata)}`;
	},

	// Open Telemetry http endpoint to send spans, traces and logs to.
	// For example http://127.0.0.1:4318
	// Defaults to null
	// Added in 1.3.0
	otlpHttpBaseURI: null,

	// Group logs together under a specific parent
	// Used for spans and traces in Open Telemetry etc.
	// Defaults to null, creating no span in otlp
	// Added in 1.3.0
	parentLog: new Log(),

	// If set to true, append spanName, spanId and traceId to the context output
	// Defaults to false
	// Added in 1.3.0
	printTraceInfo: false,

	// Use a specific span name. Any log using this log as a parent will be
	// grouped under this span name. 
	// Defaults to be the same as the span id, that is internally generated for each span
	spanName: "my-span",

	// Function that will be called to write log levels silly, debug, verbose and info.
	// Defaults to console.log
	stdout: console.log,

	// Function that will be called to write log levels error and warn.
	// Defaults to console.error
	stderr: console.error,
});
```

### Metadata

`log.info("foo", { hey: "luring" });` --> 2022-09-24T23:40:39Z [info] foo {"hey":"luring"}
