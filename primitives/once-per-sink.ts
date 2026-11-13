const warned = new WeakMap<object, Set<unknown>>();

// The one once-only rule: runs `write` the first time `key` is seen for `sink`. The key is marked
// before `write` runs, so a `write` that warns again of the same thing cannot recurse.
export function writeOnce(sink: object, key: unknown, write: () => void): void {
	let keys = warned.get(sink);

	if (!keys) {
		keys = new Set();
		warned.set(sink, keys);
	}

	if (keys.has(key)) {
		return;
	}

	keys.add(key);
	write();
}
