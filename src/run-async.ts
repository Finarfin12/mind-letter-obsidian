/**
 * Start an async function from a place that expects a callback returning void (Obsidian's onChange / onClick,
 * command callbacks, timers). The promise is never left unhandled: a failure goes to `onError`, and this function
 * itself never throws.
 */
export function runAsync(fn: () => Promise<void>, onError: (e: unknown) => void): void {
	let p: Promise<void>;
	try {
		p = fn();
	} catch (e) {
		onError(e);
		return;
	}
	p.catch((e: unknown) => {
		try {
			onError(e);
		} catch {
			/* a failing error handler must not become an unhandled rejection either */
		}
	});
}
