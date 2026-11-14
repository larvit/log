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
export function unref(timer: TimerHandle, unrefNumericTimer: ((id: number) => void) | undefined): void {
	if (typeof timer === "object" && typeof timer.unref === "function") {
		timer.unref();
	} else if (typeof timer === "number") {
		unrefNumericTimer?.(timer);
	}
}

type SchedulerConf = Pick<ResolvedQueueConf, "batchDelayMs" | "clock" | "retryDelayMs">;

type SchedulerDelays = Pick<SchedulerConf, "batchDelayMs" | "retryDelayMs">;

// `failures` counts consecutive failed sends, and sets the next retry delay. It outlives rounds, so every state carries it.
type SchedulerState = { failures: number } & (
	// Nothing is pending.
	| { name: "idle" }
	// A batch timer will start a round; a flush() starts the round now.
	| { name: "waiting" }
	// A round waits for `ready`, and will send what is scheduled meanwhile. `flushRequested`: a flush()
	// arrived meanwhile, so one more round follows this one.
	| { flushRequested: boolean, name: "loading" }
	// The round sends. `flushRequested` as above. `batchDue`: a payload was scheduled meanwhile, so a batch
	// timer follows the round. `retryInMs`: a send failed, so a retry timer follows instead.
	| { batchDue: boolean, flushRequested: boolean, name: "running", retryInMs?: number }
	// A retry timer will start a round, and a flush() doesn't start one early.
	| { name: "backingOff" }
);

// A public call (`flush`, `schedule`, `backoff` as sendFailed, `resetBackoff` as sendSucceeded) or an
// internal step of a round or a timer.
type SchedulerEvent =
	| { type: "flush" }
	| { type: "loaded" }
	| { type: "roundDone" }
	| { type: "schedule" }
	| { type: "sendFailed" }
	| { type: "sendSucceeded" }
	| { type: "timerFired" };

// What the scheduler does after a transition, in the order listed.
type SchedulerEffect =
	// Arm the one timer, whose firing is the timerFired event.
	| { delayMs: number, type: "armTimer" }
	// The flush() caller waits for the round after the one in flight.
	| { type: "joinNextRound" }
	// No round follows for the flush() callers that joined, so they stop waiting.
	| { type: "releaseJoiners" }
	// Clear the timer and start a round, which the flush() caller and those that joined wait for.
	| { type: "startRound" };

type Transition = { effects: SchedulerEffect[], state: SchedulerState };

// The delay doubles with each consecutive failed send, up to the cap.
const retryDelay = (failures: number, delays: SchedulerDelays) => Math.min(delays.retryDelayMs * (2 ** (failures - 1)), RETRY_DELAY_MAX_MS);

const stay = (state: SchedulerState): Transition => ({ effects: [], state });

function startRound(failures: number): Transition {
	return { effects: [{ type: "startRound" }], state: { failures, flushRequested: false, name: "loading" } };
}

function afterRound(state: Extract<SchedulerState, { name: "loading" | "running" }>, delays: SchedulerDelays): Transition {
	const { failures } = state;

	// The backoff holds even against a flush() that joined.
	if (state.name === "running" && state.retryInMs !== undefined) {
		return { effects: [{ type: "releaseJoiners" }, { delayMs: state.retryInMs, type: "armTimer" }], state: { failures, name: "backingOff" } };
	}

	// On a round that rejected too, so a flush() that joined it still gets a round of its own.
	if (state.flushRequested) {
		return startRound(failures);
	}

	if (state.name === "running" && state.batchDue) {
		return { effects: [{ delayMs: delays.batchDelayMs, type: "armTimer" }], state: { failures, name: "waiting" } };
	}

	return stay({ failures, name: "idle" });
}

// The whole state machine: what each event does in each state. An event a state has no use for leaves it as it is.
export function transition(state: SchedulerState, event: SchedulerEvent, delays: SchedulerDelays): Transition {
	const round = state.name === "loading" || state.name === "running";

	switch (event.type) {
		case "flush":
			if (round) {
				return { effects: [{ type: "joinNextRound" }], state: { ...state, flushRequested: true } };
			}

			return state.name === "backingOff" ? stay(state) : startRound(state.failures);
		case "schedule":
			if (state.name === "idle") {
				return { effects: [{ delayMs: delays.batchDelayMs, type: "armTimer" }], state: { failures: state.failures, name: "waiting" } };
			}

			// While loading, the round will send the payload anyway.
			return stay(state.name === "running" ? { ...state, batchDue: true } : state);
		case "timerFired":
			return state.name === "waiting" || state.name === "backingOff" ? startRound(state.failures) : stay(state);
		case "loaded":
			return stay(state.name === "loading" ? { batchDue: false, failures: state.failures, flushRequested: state.flushRequested, name: "running" } : state);
		case "roundDone":
			return round ? afterRound(state, delays) : stay(state);
		case "sendFailed": {
			const failures = state.failures + 1;

			// The retry timer starts once the round whose send failed ends.
			return stay(state.name === "running" ? { ...state, failures, retryInMs: retryDelay(failures, delays) } : { ...state, failures });
		}
		case "sendSucceeded":
			return stay({ ...state, failures: 0 });
		default:
			return event satisfies never;
	}
}

// One round runs at a time, and one timer at most starts the next. `transition` decides; this class
// holds the state and carries out the effects.
export class ExportScheduler {
	private readonly conf: SchedulerConf;
	// The flush() callers waiting for the round after the one in flight share this promise.
	private joiners?: { promise: Promise<void>, settle: (outcome?: Promise<void>) => void };
	private readonly ready: Promise<void>;
	private readonly round: () => Promise<void>;
	private state: SchedulerState = { failures: 0, name: "idle" };
	private timer?: TimerHandle;

	// No round starts before ready settles.
	constructor(conf: SchedulerConf, ready: Promise<void>, round: () => Promise<void>) {
		this.conf = conf;
		this.ready = ready;
		this.round = round;
	}

	flush(): Promise<void> {
		return this.dispatch({ type: "flush" }) ?? Promise.resolve();
	}

	schedule(): void {
		void this.dispatch({ type: "schedule" });
	}

	resetBackoff(): void {
		void this.dispatch({ type: "sendSucceeded" });
	}

	// Called by the round whose send failed. Returns the delay of the retry that follows that round.
	backoff(): number {
		void this.dispatch({ type: "sendFailed" });

		return retryDelay(this.state.failures, this.conf);
	}

	// Returns what a flush() caller waits for, where the event gave it something to wait for.
	private dispatch(event: SchedulerEvent): Promise<void> | undefined {
		const { effects, state } = transition(this.state, event, this.conf);
		let awaited: Promise<void> | undefined;

		this.state = state;

		try {
			for (const effect of effects) {
				awaited = this.carryOut(effect) ?? awaited;
			}
		} catch (err) {
			// A clock that throws leaves no round marked as running, no timer marked as armed and no flush() waiting.
			this.state = { failures: state.failures, name: "idle" };

			if (this.joiners) {
				this.settleJoiners(Promise.reject(err));
			}

			throw err;
		}

		return awaited;
	}

	private carryOut(effect: SchedulerEffect): Promise<void> | undefined {
		switch (effect.type) {
			case "armTimer":
				this.timer = this.startTimer(effect.delayMs);

				return undefined;
			case "joinNextRound":
				return this.joinNextRound();
			case "releaseJoiners":
				this.settleJoiners();

				return undefined;
			case "startRound":
				return this.startRound();
			default:
				return effect satisfies never;
		}
	}

	private joinNextRound(): Promise<void> {
		if (!this.joiners) {
			let settle: (outcome?: Promise<void>) => void = () => {};
			const promise = new Promise<void>(resolve => { settle = resolve; });

			this.joiners = { promise, settle };
		}

		return this.joiners.promise;
	}

	private settleJoiners(outcome?: Promise<void>): void {
		const joiners = this.joiners;

		this.joiners = undefined;
		joiners?.settle(outcome);
	}

	// The round sends what a pending timer was waiting for, so it clears that timer.
	private startRound(): Promise<void> {
		this.conf.clock.clearTimeout(this.timer);
		this.timer = undefined;

		const round = (async () => {
			try {
				await this.ready;
				void this.dispatch({ type: "loaded" });
				await this.round();
			} finally {
				void this.dispatch({ type: "roundDone" });
			}
		})();

		this.settleJoiners(round);

		return round;
	}

	private startTimer(delayMs: number): TimerHandle {
		const handle = this.conf.clock.setTimeout(() => { void this.dispatch({ type: "timerFired" }); }, delayMs);

		// An injected clock's number may not be a Deno timer id, and unrefing a stranger's timer could stop an unrelated one.
		unref(handle, this.conf.clock === systemClock ? denoUnrefTimer() : undefined);

		return handle;
	}
}
