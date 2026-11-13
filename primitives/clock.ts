// The library's one source of time; now() returns epoch milliseconds.
export type Clock = {
	clearTimeout: (timer?: TimerHandle) => void;
	now: () => number;
	setTimeout: (callback: () => void, delayMs: number) => TimerHandle;
};

// setTimeout's return: an object in Node, Bun and Deno, a number in browsers and in a test clock.
export type TimerHandle = ReturnType<typeof setTimeout> | number;

export const systemClock: Clock = {
	clearTimeout: timer => clearTimeout(timer),
	now: () => Date.now(),
	setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
};
