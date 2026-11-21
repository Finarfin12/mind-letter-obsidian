import { requestUrl } from "obsidian";
import type { HttpClient } from "@mind-letter/ai";

/** HTTP through Obsidian's requestUrl (no CORS limits). Non-2xx answers are returned, not thrown, so callers can read the status. */
export const obsidianHttp: HttpClient = {
	async get(url, opts) {
		const r = await requestUrl({ url, method: "GET", headers: opts?.headers, throw: false });
		return { status: r.status, text: r.text };
	},
	async post(url, body, opts) {
		const r = await requestUrl({ url, method: "POST", body, headers: { "Content-Type": "application/json", ...(opts?.headers ?? {}) }, throw: false });
		return { status: r.status, text: r.text };
	},
};
