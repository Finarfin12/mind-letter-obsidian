import { API_DEFAULT_BASE, LOCAL_DEFAULT_BASE, apiHeaders, lmstudioBase } from "./discovery";
import { isLocalUrl, joinUrl } from "./http";
import { CLI_SPECS, assertGuards, isSafeModelName } from "./specs";
import type { AiPrompt, AiProvider, AiSettings, HttpClient, ProviderDeps } from "./types";
import { withTimeout } from "./timeout";

const asRecord = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (typeof v === "string" ? v : "");

function parseJson(text: string): Record<string, unknown> {
	try {
		return asRecord(JSON.parse(text));
	} catch {
		throw new Error("response is not JSON");
	}
}

const MAX_RESPONSE_CHARS = 262144;

/** Text from each provider's reply format. Throws when the reply has no text. */
export function extractReply(kind: "ollama" | "openai" | "anthropic" | "gemini", text: string): string {
	if (text.length > MAX_RESPONSE_CHARS) throw new Error("response too large");
	const o = parseJson(text);
	let out = "";
	if (kind === "ollama") out = str(asRecord(o.message).content);
	else if (kind === "openai") out = str(asRecord(asRecord(asArray(o.choices)[0]).message).content);
	else if (kind === "anthropic") out = asArray(o.content).map((p) => str(asRecord(p).text)).join("");
	else out = asArray(asRecord(asRecord(asArray(o.candidates)[0]).content).parts).map((p) => str(asRecord(p).text)).join("");
	if (out.trim() === "") throw new Error("no text in response");
	return out;
}

/** Private details never go into error text: a transport error can carry the URL or a key. */
function safeError(e: unknown, secrets: string[]): Error {
	let msg = e instanceof Error ? e.message : "request failed";
	for (const s of secrets) if (s.length >= 4) msg = msg.split(s).join("[redacted]");
	return new Error(msg.slice(0, 200));
}

class CliProvider implements AiProvider {
	readonly cloud = true;
	readonly label: string;
	constructor(private tool: AiSettings["cli"], private model: string, private deps: ProviderDeps) {
		this.label = tool === "claude" ? "Claude Code (claude)" : tool;
	}

	async complete(prompt: AiPrompt, opts: { signal: AbortSignal }): Promise<string> {
		const spec = CLI_SPECS[this.tool];
		// Detect-only CLIs refuse BEFORE touching the file system or spawning anything
		if (spec.detectOnly) throw new Error(spec.detectOnly);
		if (!isSafeModelName(this.model)) throw new Error("invalid model name");
		const exe = await this.deps.findExe(spec.exe);
		if (!exe) throw new Error(`${spec.exe} not found in PATH`);
		const args = spec.buildArgs({ system: prompt.system, model: this.model });
		assertGuards(spec, args);
		const sandbox = await this.deps.makeSandbox();
		try {
			// Note text ONLY via stdin; cwd = an empty temp folder; no shell (see the runner).
			const res = await this.deps.runner.run(exe, args, { stdin: prompt.user, cwd: sandbox.dir, signal: opts.signal });
			if (res.code !== 0) throw new Error(`${spec.exe} exited with code ${String(res.code)}`);
			return spec.parseOutput(res.stdout);
		} finally {
			await sandbox.cleanup();
		}
	}
}

class HttpProvider implements AiProvider {
	readonly cloud: boolean;
	readonly label: string;
	constructor(
		private ai: AiSettings,
		private http: HttpClient,
		private url: string,
		private headers: Record<string, string>,
		private kind: "ollama" | "openai" | "anthropic" | "gemini",
		label: string,
		cloud: boolean,
	) {
		this.label = label;
		this.cloud = cloud;
	}

	async complete(prompt: AiPrompt, opts: { signal: AbortSignal }): Promise<string> {
		const model = this.ai.model;
		let body: object;
		if (this.kind === "ollama") {
			body = { model, stream: false, messages: [{ role: "system", content: prompt.system }, { role: "user", content: prompt.user }] };
		} else if (this.kind === "anthropic") {
			body = { model, max_tokens: 1800, system: prompt.system, messages: [{ role: "user", content: prompt.user }] };
		} else if (this.kind === "gemini") {
			body = {
				systemInstruction: { parts: [{ text: prompt.system }] },
				contents: [{ role: "user", parts: [{ text: prompt.user }] }],
				generationConfig: { maxOutputTokens: 1800 },
			};
		} else {
			body = { model, stream: false, temperature: 0.5, messages: [{ role: "system", content: prompt.system }, { role: "user", content: prompt.user }] };
		}
		try {
			const r = await withTimeout(
				this.http.post(this.url, JSON.stringify(body), { headers: { "Content-Type": "application/json", ...this.headers } }),
				this.ai.timeoutSec * 1000,
				"request",
			);
			if (opts.signal.aborted) throw new Error("aborted");
			if (r.status < 200 || r.status >= 300) throw new Error(`HTTP ${r.status}`);
			return extractReply(this.kind, r.text);
		} catch (e) {
			throw safeError(e, [this.ai.apiKey]);
		}
	}
}

/**
 * Build the provider selected in the settings, or null when AI is off, the provider cannot run letters (detect-only CLI,
 * no model, no key, mobile without Node) or its address is not allowed. Creating a provider touches nothing:
 * no process, no request.
 */
export function createProvider(ai: AiSettings, deps: ProviderDeps): AiProvider | null {
	if (ai.provider === "off") return null;
	if (!isSafeModelName(ai.model)) return null;

	if (ai.provider === "cli") {
		if (!deps.canSpawn || CLI_SPECS[ai.cli].detectOnly) return null;
		return new CliProvider(ai.cli, ai.model, deps);
	}
	if (!deps.http) return null;

	if (ai.provider === "local") {
		if (ai.local === "ollama") {
			if (ai.model === "") return null;
			const base = ai.localUrl.trim() || LOCAL_DEFAULT_BASE.ollama;
			if (!isLocalUrl(base)) return null; // the "local" provider only talks to this computer
			return new HttpProvider(ai, deps.http, joinUrl(base, "/api/chat"), {}, "ollama", "Ollama", false);
		}
		const base = lmstudioBase(ai.localUrl);
		if (!isLocalUrl(base)) return null;
		return new HttpProvider(ai, deps.http, joinUrl(base, "/chat/completions"), {}, "openai", "LM Studio", false);
	}

	// cloud API: https only (or a server on this computer); the key only goes to the configured address
	if (ai.model === "") return null;
	const base = (ai.apiUrl.trim() || API_DEFAULT_BASE[ai.api]).replace(/\/+$/, "");
	let host = "";
	try {
		const u = new URL(base);
		if (u.username || u.password) return null;
		if (u.protocol !== "https:" && !(u.protocol === "http:" && isLocalUrl(base))) return null;
		host = u.host;
	} catch {
		return null;
	}
	if (ai.apiKey.trim() === "" && !isLocalUrl(base)) return null;
	const headers = ai.apiKey.trim() === "" ? {} : apiHeaders(ai.api, ai.apiKey.trim());
	const cloud = !isLocalUrl(base);
	if (ai.api === "anthropic") return new HttpProvider(ai, deps.http, joinUrl(base, "/messages"), headers, "anthropic", host, cloud);
	if (ai.api === "gemini") {
		const model = ai.model.replace(/^models\//, "");
		return new HttpProvider(ai, deps.http, joinUrl(base, `/models/${encodeURIComponent(model)}:generateContent`), headers, "gemini", host, cloud);
	}
	return new HttpProvider(ai, deps.http, joinUrl(base, "/chat/completions"), headers, "openai", host, cloud);
}
