/** HTTP helpers (no Obsidian imports, so providers can be tested against a local mock server). */
export type { HttpClient, HttpResponse } from "./types";

/** Join a base URL and a path without doubling the slash. */
export function joinUrl(base: string, path: string): string {
	return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

/** localhost / 127.x / ::1 count as local; everything else is cloud. */
export function isLocalUrl(url: string): boolean {
	try {
		const h = new URL(url).hostname.toLowerCase();
		return h === "localhost" || h === "::1" || h === "[::1]" || /^127\./.test(h);
	} catch {
		return false;
	}
}
