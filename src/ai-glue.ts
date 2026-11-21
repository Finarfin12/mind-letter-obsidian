import { Platform } from "obsidian";
import { createNodeEnv, type NodeEnv, type NodeRequire, type ProviderDeps } from "@mind-letter/ai";
import { obsidianHttp } from "./obsidian-http";

let cached: NodeEnv | null | undefined;

/** Node APIs exist only in the desktop app. They are loaded lazily and only when AI actually needs them. */
function nodeEnv(): NodeEnv | null {
	if (cached !== undefined) return cached;
	const req = Platform.isDesktopApp ? (window as unknown as { require?: NodeRequire }).require : undefined;
	cached = typeof req === "function" ? createNodeEnv(req) : null;
	return cached;
}

/** Everything the AI layer needs. Without Node (mobile) CLI providers are reported as desktop-only and HTTP ones still work. */
export function buildProviderDeps(): ProviderDeps {
	const env = nodeEnv();
	return {
		runner: env?.runner ?? { run: () => Promise.reject(new Error("no Node on this platform")) },
		findExe: env ? n => env.findExe(n) : () => Promise.resolve(null),
		makeSandbox: env ? () => env.makeSandbox() : () => Promise.reject(new Error("no Node on this platform")),
		http: obsidianHttp,
		canSpawn: env !== null,
		io: env?.io ?? null,
	};
}
