// OTLP export: scheduling rounds.

import { systemClock, type TimerHandle } from "../log/clock.js";
import type { ResolvedQueueConf } from "./queue-items.js";

const RETRY_DELAY_MAX_MS = 30000;

// Deno's unref for a numeric timer id, or undefined elsewhere.
function denoUnrefTimer(): ((id: number) => void) | undefined {
	const deno: unknown = Reflect.get(globalThis, "Deno");
	const unrefTimer: unknown = typeof deno === "object" && deno !== null ? Reflect.get(deno, "unrefTimer") : undefined;

	return typeof unrefTimer === "function" ? unrefTimer as (id: number) => void : undefined;
}

// A pending batch or retry must not keep a finished Node or Deno process alive.
function unref(timer: TimerHandle, unrefNumericTimer: ((id: number) => void) | undefined): void {
	if (typeof timer === "object" && typeof timer.unref === "function") {
		timer.unref();
	} else if (typeof timer === "number") {
		unrefNumericTimer?.(timer);
	}
}

// One round runs at a time, callers arriving mid-round join one next round, and setTimer installs
// the one timer that starts a round — a batch wait, or a backoff flush() must not jump.
type SchedulerConf = Pick<ResolvedQueueConf, "batchDelayMs" | "clock" | "retryDelayMs">;

export class ExportScheduler {
	private readonly conf: SchedulerConf;
	private failures = 0;
	private pending?: Promise<void>;
	private readonly ready: Promise<void>;
	private readonly round: () => Promise<void>;
	private running?: Promise<void>;
	private timer?: { handle: TimerHandle, retry: boolean };

	// No round starts before ready settles.
	constructor(conf: SchedulerConf, ready: Promise<void>, round: () => Promise<void>) {
		this.conf = conf;
		this.ready = ready;
		this.round = round;
	}

	// While a retry is pending, flush() attempts nothing new: the timer decides.
	flush(): Promise<void> {
		if (this.timer?.retry) {
			return this.running ?? Promise.resolve();
		}

		if (!this.running) {
			this.running = this.ready.then(() => {
				// The round sends what the timer was waiting for. After ready, or a timer installed before
				// it settles would survive the round.
				this.conf.clock.clearTimeout(this.timer?.handle);
				this.timer = undefined;

				return this.round();
			}).finally(() => { this.running = undefined; });

			return this.running;
		}

		// Both outcomes: a rejection-only skip left pending set, failing every later joiner.
		const next = () => {
			this.pending = undefined;

			return this.flush();
		};

		this.pending ??= this.running.then(next, next);

		return this.pending;
	}

	schedule(): void {
		if (!this.timer) {
			this.setTimer(false, this.conf.batchDelayMs);
		}
	}

	resetBackoff(): void {
		this.failures = 0;
	}

	// A payload enqueued mid-round leaves a batch timer behind; the backoff takes it over.
	backoff(): number {
		this.failures++;

		const retryInMs = Math.min(this.conf.retryDelayMs * (2 ** (this.failures - 1)), RETRY_DELAY_MAX_MS);

		this.setTimer(true, retryInMs);

		return retryInMs;
	}

	// Whatever timer it replaces is cleared, so no stray callback fires.
	private setTimer(retry: boolean, delayMs: number): void {
		this.conf.clock.clearTimeout(this.timer?.handle);
		this.timer = undefined;

		const handle = this.conf.clock.setTimeout(() => {
			this.timer = undefined;
			void this.flush();
		}, delayMs);

		// An injected clock's number may not be a Deno timer id, and unrefing a stranger's timer could stop an unrelated one.
		unref(handle, this.conf.clock === systemClock ? denoUnrefTimer() : undefined);
		this.timer = { handle, retry };
	}
}
