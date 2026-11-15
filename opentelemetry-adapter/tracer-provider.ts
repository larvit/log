import { type Context, context, INVALID_SPAN_CONTEXT, type Span, type SpanOptions, trace, type Tracer, type TracerProvider } from "@opentelemetry/api";
import type { Log } from "../log/log.js";
import type { Metadata } from "../primitives/metadata.js";
import { RecordedSpan } from "./recorded-span.js";
import { warnOnceToStderr } from "../log/stderr-lines.js";

// A symbol of this module's own, where createContextKey would share one with every copy of this
// package, so only this module's runWithLog writes under it.
const LOG_KEY = Symbol("@larvit/log: the Log spans are exported through");

/**
 * Runs `callback` so that each span an OpenTelemetry tracer starts while `callback` runs, or in
 * what `callback` awaits, joins the trace of `log`, nests under the span of `log` and is exported
 * through the transports of `log`. It needs OpenTelemetry's context manager installed, and returns
 * what `callback` returns.
 */
export function runWithLog<T>(log: Log, callback: () => T): T {
	const { spanId, traceId } = log.span;
	const bound = trace.setSpanContext(context.active().setValue(LOG_KEY, log), { spanId, traceFlags: log.sampled ? 1 : 0, traceId });

	return context.with(bound, () => {
		// OpenTelemetry's stand-in for a missing context manager runs the callback and keeps no context.
		if (context.active() !== bound) {
			warnOnceToStderr(log.conf, log.context, "@larvit/log: runWithLog found no OpenTelemetry context manager, so no span joins this Log; install one with context.setGlobalContextManager()");
		}

		return callback();
	});
}

type ActiveSpanArgs<F> = [F] | [SpanOptions, F] | [SpanOptions, Context, F];

// `scope` holds the tracer's name and version as attributes, since a transport is handed a span
// and no scope.
function tracer(scope: Metadata): Tracer {
	// A span that is not recorded passes its parent's ids on, so what is propagated downstream
	// still names the caller.
	function startSpan(name: string, options: SpanOptions = {}, active: Context = context.active()): Span {
		// Only runWithLog writes LOG_KEY. `instanceof Log` would reject every caller's Log: otel.js
		// bundles its own copy of the class, and the caller's comes from index.js.
		const log = active.getValue(LOG_KEY) as Log | undefined;
		const parent = options.root ? undefined : trace.getSpanContext(active);

		return log?.sampled ? new RecordedSpan(log, scope, name, options, parent) : trace.wrapSpanContext(parent ?? INVALID_SPAN_CONTEXT);
	}

	function runActive<F extends (span: Span) => ReturnType<F>>(name: string, options: SpanOptions | undefined, active: Context, callback: F): ReturnType<F> {
		const span = startSpan(name, options, active);

		return context.with(trace.setSpan(active, span), callback, undefined, span);
	}

	function startActiveSpan<F extends (span: Span) => ReturnType<F>>(name: string, ...args: ActiveSpanArgs<F>): ReturnType<F> {
		if (args.length === 1) return runActive(name, undefined, context.active(), args[0]);
		if (args.length === 2) return runActive(name, args[0], context.active(), args[1]);

		return runActive(name, args[0], args[1], args[2]);
	}

	return { startActiveSpan, startSpan };
}

/**
 * A tracer provider for `trace.setGlobalTracerProvider()`: the spans its tracers record inside
 * `runWithLog` are exported through the Log handed there.
 */
export function logTracerProvider(): TracerProvider {
	return {
		getTracer: (name, version) => tracer({ "otel.scope.name": name, ...version ? { "otel.scope.version": version } : {} }),
	};
}
