import { type Context, context, createContextKey, INVALID_SPAN_CONTEXT, type Span, type SpanOptions, trace, type Tracer, type TracerProvider } from "@opentelemetry/api";
import type { Log } from "../log/log.js";
import type { Metadata } from "../primitives/metadata.js";
import { RecordedSpan } from "./recorded-span.js";
import { warnOnceToStderr } from "../log/stderr-lines.js";

// Where OpenTelemetry's context carries the Log that runWithLog was handed.
const LOG_KEY = createContextKey("@larvit/log: the Log spans are exported through");

/**
 * Runs `callback` so that each span an OpenTelemetry tracer starts while it runs, or in what it awaits,
 * joins the trace of `log`, nests under its span and is exported through its transports. It needs
 * OpenTelemetry's context manager installed, and returns what `callback` returns.
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

// `scope` names the instrumentation that asked for the tracer, in the attributes OpenTelemetry's
// specification gives an exporter with no scope field of its own to fill. Every span leaves under
// this library's scope, since a transport is handed a span and no scope.
function tracer(scope: Metadata): Tracer {
	// A span is recorded only inside runWithLog, under a Log whose trace is sampled. Any other span
	// only passes its parent's ids on, so what is propagated downstream still names the caller.
	function startSpan(name: string, options: SpanOptions = {}, active: Context = context.active()): Span {
		const log = active.getValue(LOG_KEY) as Log | undefined;
		const parent = options.root ? undefined : trace.getSpanContext(active);

		return log?.sampled ? new RecordedSpan(log, scope, name, options, parent) : trace.wrapSpanContext(parent ?? INVALID_SPAN_CONTEXT);
	}

	function startActiveSpan<F extends (span: Span) => unknown>(name: string, ...args: ActiveSpanArgs<F>): ReturnType<F> {
		const callback = args[args.length - 1] as F;
		const options = args.length > 1 ? args[0] as SpanOptions : undefined;
		const active = args.length > 2 ? args[1] as Context : context.active();
		const span = startSpan(name, options, active);

		return context.with(trace.setSpan(active, span), callback as (span: Span) => ReturnType<F>, undefined, span);
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
