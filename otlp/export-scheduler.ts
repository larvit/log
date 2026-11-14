import { systemClock, type TimerHandle } from "../primitives/clock.js";
import type { ResolvedQueueConf } from "./queue-types.js";

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

// What is pending decides what each call does. Each call is an event, and every change of state
// goes through `transition`.
type SchedulerState =
	// Nothing is pending.
	| { name: "idle" }
	// A batch timer will start a round; flush() starts it now.
	| { name: "waiting", timer: TimerHandle }
	// A round waits for storage to load, and will send what is scheduled meanwhile. A flush() arriving
	// now joins `next`, the one round after it.
	| { name: "loading", next?: Promise<void>, round: Promise<void> }
	// The round sends. `next` as above. `batchDue`: a payload was scheduled meanwhile, so a batch timer
	// follows the round. `retryInMs`: a send failed, so a retry timer follows instead, and a flush()
	// arriving after that waits for this round only.
	| { name: "running", batchDue: boolean, next?: Promise<void>, retryInMs?: number, round: Promise<void> }
	// A retry timer will start a round, and flush() must not jump it.
	| { name: "backingOff", timer: TimerHandle };

type SchedulerEvent = "flush" | "loaded" | "roundDone" | "schedule" | "timerFired" | { retryInMs: number };

type SchedulerConf = Pick<ResolvedQueueConf, "batchDelayMs" | "clock" | "retryDelayMs">;

// One round runs at a time, and one timer at most starts the next.
export class ExportScheduler {
	private readonly conf: SchedulerConf;
	// Consecutive failed sends, which set the next backoff. A count, not a state: it outlives rounds.
	private failures = 0;
	private readonly ready: Promise<void>;
	private readonly round: () => Promise<void>;
	private state: SchedulerState = { name: "idle" };

	// No round starts before ready settles.
	constructor(conf: SchedulerConf, ready: Promise<void>, round: () => Promise<void>) {
		this.conf = conf;
		this.ready = ready;
		this.round = round;
	}

	flush(): Promise<void> {
		return this.transition("flush");
	}

	schedule(): void {
		void this.transition("schedule");
	}

	resetBackoff(): void {
		this.failures = 0;
	}

	// Called by the round whose send failed: the retry timer starts once that round ends.
	backoff(): number {
		this.failures++;

		const retryInMs = Math.min(this.conf.retryDelayMs * (2 ** (this.failures - 1)), RETRY_DELAY_MAX_MS);

		void this.transition({ retryInMs });

		return retryInMs;
	}

	// Returns what a flush() caller waits for; the other events ignore it.
	private transition(event: SchedulerEvent): Promise<void> {
		const state = this.state;

		switch (state.name) {
			case "idle":
				if (event === "flush") {
					return this.startRound();
				}

				if (event === "schedule") {
					this.state = { name: "waiting", timer: this.startTimer(this.conf.batchDelayMs) };
				}

				return Promise.resolve();
			case "waiting":
				return event === "flush" || event === "timerFired" ? this.startRound() : Promise.resolve();
			case "backingOff":
				return event === "timerFired" ? this.startRound() : Promise.resolve();
			case "loading":
			case "running":
				return this.transitionRound(state, event);
		}
	}

	private transitionRound(state: Extract<SchedulerState, { name: "loading" | "running" }>, event: SchedulerEvent): Promise<void> {
		const failed = state.name === "running" && state.retryInMs !== undefined;

		switch (event) {
			case "flush":
				if (failed) {
					return state.round;
				}

				// Both outcomes: a flush() joining a round that rejects still gets a round of its own.
				state.next ??= state.round.then(() => this.flush(), () => this.flush());

				return state.next;
			case "loaded":
				this.state = { batchDue: false, name: "running", next: state.next, round: state.round };
				break;
			case "schedule":
				// While loading, the round will send the payload anyway.
				if (state.name === "running") {
					state.batchDue = true;
				}

				break;
			case "roundDone":
				// Idle first, so a clock that throws in setTimeout leaves no round marked as running.
				this.state = { name: "idle" };

				if (state.name === "running" && state.retryInMs !== undefined) {
					this.state = { name: "backingOff", timer: this.startTimer(state.retryInMs) };
				} else if (state.name === "running" && state.batchDue) {
					this.state = { name: "waiting", timer: this.startTimer(this.conf.batchDelayMs) };
				}

				break;
			case "timerFired":
				break;
			default:
				if (state.name === "running") {
					state.retryInMs = event.retryInMs;
				}
		}

		return state.round;
	}

	// The round sends what a pending timer was waiting for, so that timer goes.
	private startRound(): Promise<void> {
		const state = this.state;

		this.conf.clock.clearTimeout("timer" in state ? state.timer : undefined);

		const round = (async () => {
			try {
				await this.ready;
				void this.transition("loaded");
				await this.round();
			} finally {
				void this.transition("roundDone");
			}
		})();

		this.state = { name: "loading", round };

		return round;
	}

	private startTimer(delayMs: number): TimerHandle {
		const handle = this.conf.clock.setTimeout(() => { void this.transition("timerFired"); }, delayMs);

		// An injected clock's number may not be a Deno timer id, and unrefing a stranger's timer could stop an unrelated one.
		unref(handle, this.conf.clock === systemClock ? denoUnrefTimer() : undefined);

		return handle;
	}
}
