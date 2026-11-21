/** Limit the time of a promise. Rejects with an Error (never another value) to satisfy prefer-promise-reject-errors. */
export function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const t = window.setTimeout(() => reject(new Error(`${label}: timeout ${ms}ms`)), ms);
		p.then(
			(v) => {
				window.clearTimeout(t);
				resolve(v);
			},
			(e) => {
				window.clearTimeout(t);
				reject(e instanceof Error ? e : new Error(String(e)));
			},
		);
	});
}
