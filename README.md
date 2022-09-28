![Build and test](https://github.com/larvit/log/actions/workflows/master.yml/badge.svg)

# @larvit/log

Zero dependency, structured logging with a simple interface.

## Installation

`npm i @larvit/log` or `yarn add @larvit/log`

## Usage

```javascript
import { Log } from "@larvit/log";

const log = new Log();
log.error("Apocalypse! :O"); // stderr
log.warn("The chaos is near"); // stderr
log.info("All is well, but this message is important"); // stdout
log.verbose("Extra info, likely good in a production environment"); // stdout
log.debug("A lot of detailed logs to debug your application"); // stdout
log.silly("Open the flood gates!"); // stdout
```

### Configuration

**Log level**  
`const log = new Log("info");` Will only output error, warn and info logs. This is the default. All possible options: "error", "warn", "info", "verbose", "debug", "silly" and "none".

**Other options**  
```javascript
const log = new Log({
	// Context will be appended as metadata to all log entries
	// Default is an empty context
	context: {
		key: "string",
		anotherKey: "string",
	},

	// Options are "text" and "json", "text" is the default
	format: "text",

	// Default to "info", same as Log level section above
	logLevel: "info",

	// The function that formats the log entry
	entryFormatter: ({ logLevel, metadata, msg }) => {
		return `${logLevel}: ${msg} ${JSON.stringify(metadata)}`;
	},

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
