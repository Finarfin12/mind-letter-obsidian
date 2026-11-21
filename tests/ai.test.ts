import { describe, expect, it } from "vitest";
import { DEFAULT_LETTER_SETTINGS, runPipeline, emptyMemory } from "@mind-letter/core";
import {
	CLI_SPECS,
	DEFAULT_AI,
	assertGuards,
	createProvider,
	discoverModels,
	isLocalUrl,
	isSafeModelName,
	parseAgyModels,
	parseClaudeHelpAliases,
	providerSlot,
	refineWithAi,
	type AiSettings,
	type HttpClient,
	type ProviderDeps,
} from "@mind-letter/ai";
import { NOW, syntheticVault } from "./fixtures";

interface Call {
	method: "GET" | "POST";
	url: string;
	body?: string;
	headers?: Record<string, string>;
}

function mockHttp(handler: (c: Call) => { status: number; text: string }): { http: HttpClient; calls: Call[] } {
	const calls: Call[] = [];
	const http: HttpClient = {
		get: async (url, o) => {
			const c: Call = { method: "GET", url, headers: o?.headers };
			calls.push(c);
			return handler(c);
		},
		post: async (url, body, o) => {
			const c: Call = { method: "POST", url, body, headers: o?.headers };
			calls.push(c);
			return handler(c);
		},
	};
	return { http, calls };
}

function deps(http: HttpClient | null, canSpawn = false): ProviderDeps {
	return {
		runner: { run: () => Promise.reject(new Error("must not run a process")) },
		findExe: () => Promise.resolve(null),
		makeSandbox: () => Promise.reject(new Error("no sandbox")),
		http,
		canSpawn,
		io: null,
	};
}

const ai = (over: Partial<AiSettings>): AiSettings => ({ ...DEFAULT_AI, ...over });

function basePoints() {
	return runPipeline({ notes: syntheticVault(), now: NOW, settings: { ...DEFAULT_LETTER_SETTINGS, lang: "id" }, memory: emptyMemory(), generatedBy: "test" });
}

describe("CLI safety (P3)", () => {
	it("only Claude Code is runnable; Codex, Gemini and agy are detect-only", () => {
		expect(CLI_SPECS.claude.detectOnly).toBeUndefined();
		for (const t of ["codex", "gemini", "agy"] as const) expect(CLI_SPECS[t].detectOnly).toBeTruthy();
	});

	it("a detect-only CLI never gets a provider, even when approved", () => {
		for (const cli of ["codex", "gemini", "agy"] as const) {
			expect(createProvider(ai({ provider: "cli", cli, model: "x" }), deps(null, true))).toBeNull();
		}
	});

	it("Claude arguments carry every guard flag and pass assertGuards", () => {
		const args = CLI_SPECS.claude.buildArgs({ system: "s", model: "sonnet" });
		expect(() => assertGuards(CLI_SPECS.claude, args)).not.toThrow();
		for (const flag of ["-p", "--no-session-persistence", "--safe-mode", "--strict-mcp-config"]) expect(args).toContain(flag);
		expect(args[args.indexOf("--tools") + 1]).toBe("");
		expect(args[args.indexOf("--permission-mode") + 1]).toBe("dontAsk");
	});

	it("a missing guard or a forbidden argument stops the spawn", () => {
		const args = CLI_SPECS.claude.buildArgs({ system: "s", model: "" });
		expect(() => assertGuards(CLI_SPECS.claude, args.filter(a => a !== "--safe-mode"))).toThrow(/safety flag missing/);
		expect(() => assertGuards(CLI_SPECS.claude, [...args, "--dangerously-skip-permissions"])).toThrow(/forbidden/);
		expect(() => assertGuards(CLI_SPECS.claude, [...args, "--bare"])).toThrow(/forbidden/);
	});

	it("a model name cannot smuggle a flag", () => {
		expect(isSafeModelName("--tools")).toBe(false);
		expect(isSafeModelName("a b")).toBe(false);
		expect(isSafeModelName("claude-sonnet-5-5")).toBe(true);
		expect(createProvider(ai({ provider: "cli", cli: "claude", model: "--x" }), deps(null, true))).toBeNull();
	});

	it("no CLI provider without Node (mobile)", () => {
		expect(createProvider(ai({ provider: "cli", cli: "claude" }), deps(null, false))).toBeNull();
	});
});

describe("provider rules", () => {
	it("the local provider only talks to this computer", () => {
		const { http } = mockHttp(() => ({ status: 200, text: "{}" }));
		expect(createProvider(ai({ provider: "local", local: "ollama", model: "m", localUrl: "https://example.com" }), deps(http))).toBeNull();
		expect(createProvider(ai({ provider: "local", local: "ollama", model: "m" }), deps(http))).not.toBeNull();
		expect(isLocalUrl("http://localhost:11434")).toBe(true);
		expect(isLocalUrl("http://192.168.1.5:11434")).toBe(false);
	});

	it("the cloud API needs https, a key and a model", () => {
		const { http } = mockHttp(() => ({ status: 200, text: "{}" }));
		const base = { provider: "api" as const, api: "openai" as const, model: "m", apiKey: "k" };
		expect(createProvider(ai(base), deps(http))?.cloud).toBe(true);
		expect(createProvider(ai({ ...base, apiUrl: "http://example.com/v1" }), deps(http))).toBeNull();
		expect(createProvider(ai({ ...base, apiKey: "" }), deps(http))).toBeNull();
		expect(createProvider(ai({ ...base, model: "" }), deps(http))).toBeNull();
		expect(createProvider(ai({ ...base, apiUrl: "https://u:p@example.com/v1" }), deps(http))).toBeNull();
	});

	it("approval belongs to one provider slot", () => {
		const a = ai({ provider: "api", api: "openai", approvedSlot: "" });
		const slot = providerSlot(a);
		expect(providerSlot({ ...a, api: "anthropic" })).not.toBe(slot);
		expect(providerSlot({ ...a, apiUrl: "https://other.example/v1" })).not.toBe(slot);
	});
});

describe("model detection (P4): nothing is hard-coded", () => {
	it("cloud API without a key: needsKey and zero requests", async () => {
		const { http, calls } = mockHttp(() => ({ status: 200, text: "{}" }));
		const r = await discoverModels({ kind: "api", api: "openai", baseUrl: "", apiKey: "" }, { ...deps(http), runner: deps(http).runner });
		expect(r.status).toBe("needsKey");
		expect(r.models).toEqual([]);
		expect(calls).toHaveLength(0);
	});

	it("local server: models come from the server's own list", async () => {
		const { http, calls } = mockHttp(() => ({ status: 200, text: JSON.stringify({ models: [{ name: "alpha:1b" }, { name: "beta:7b" }] }) }));
		const r = await discoverModels({ kind: "local", local: "ollama", baseUrl: "" }, deps(http));
		expect(r.connected).toBe(true);
		expect(r.models).toEqual(expect.arrayContaining(["alpha:1b", "beta:7b"]));
		expect(calls[0]?.url).toBe("http://localhost:11434/api/tags");
	});

	it("an unreachable server is a status, not an exception", async () => {
		const http: HttpClient = { get: () => Promise.reject(new Error("ECONNREFUSED")), post: () => Promise.reject(new Error("x")) };
		const r = await discoverModels({ kind: "local", local: "lmstudio", baseUrl: "" }, deps(http));
		expect(r.connected).toBe(false);
		expect(r.models).toEqual([]);
	});

	it("rejected key is reported as unauthorized", async () => {
		const { http } = mockHttp(() => ({ status: 401, text: "{}" }));
		const r = await discoverModels({ kind: "api", api: "openai", baseUrl: "", apiKey: "bad" }, deps(http));
		expect(r.status).toBe("unauthorized");
	});

	it("CLI detection without Node is desktop-only", async () => {
		const r = await discoverModels({ kind: "cli", tool: "claude" }, deps(null, false));
		expect(r.status).toBe("desktopOnly");
	});

	it("agy and Claude help parsers read what the program prints", () => {
		const agy = parseAgyModels("gemini-3-pro\tGemini 3 Pro\nother-id\tOther\n");
		expect(agy.ids).toEqual(["gemini-3-pro", "other-id"]);
		expect(agy.labels["other-id"]).toBe("Other");
		expect(parseClaudeHelpAliases("--model <model>  Model alias (e.g. 'sonnet' or 'opus') or full name")).toEqual(expect.arrayContaining(["sonnet", "opus"]));
	});
});

describe("AI refinement is safe (P2, P3)", () => {
	const approved = (over: Partial<AiSettings> = {}): AiSettings => {
		const a = ai({ provider: "local", local: "ollama", model: "m", ...over });
		return { ...a, approvedSlot: providerSlot(a) };
	};
	const reply = (content: string) => ({ status: 200, text: JSON.stringify({ message: { content } }) });

	it("AI off: nothing is sent", async () => {
		const { http, calls } = mockHttp(() => reply("{}"));
		const out = await refineWithAi(DEFAULT_AI, deps(http), basePoints().points, "id");
		expect(out.status).toBe("off");
		expect(calls).toHaveLength(0);
	});

	it("AI on but not approved: nothing is sent", async () => {
		const { http, calls } = mockHttp(() => reply("{}"));
		const out = await refineWithAi(ai({ provider: "local", model: "m" }), deps(http), basePoints().points, "id");
		expect(out.status).toBe("not-approved");
		expect(calls).toHaveLength(0);
	});

	it("an approval for another provider does not count", async () => {
		const { http, calls } = mockHttp(() => reply("{}"));
		const a = { ...approved(), approvedSlot: "local:lmstudio:" };
		expect((await refineWithAi(a, deps(http), basePoints().points, "id")).status).toBe("not-approved");
		expect(calls).toHaveLength(0);
	});

	it("a good reply replaces the wording; links and quotes stay from the facts", async () => {
		const points = basePoints().points;
		const first = points.find(p => p.kind !== "question")!;
		const link = first.facts.links[0];
		const body = `Versi lebih ringkas. ${link ? `[[${link.path.replace(/\.md$/i, "")}]]` : ""}`.trim();
		const { http, calls } = mockHttp(() => reply(JSON.stringify({ points: [{ number: first.number, body }] })));
		const out = await refineWithAi(approved(), deps(http), points, "id");
		expect(out.status).toBe("ok");
		expect(out.accepted).toContain(first.number);
		expect(out.points.find(p => p.number === first.number)?.body).toBe(body);
		expect(calls).toHaveLength(1);
		expect(calls[0]?.url.startsWith("http://localhost")).toBe(true);
	});

	it("an invented link or quote is rejected and the rule-based text stays", async () => {
		const points = basePoints().points;
		const first = points.find(p => p.kind !== "question")!;
		const invented = JSON.stringify({ points: [{ number: first.number, body: "Lihat [[Catatan yang tidak ada]] dan kutipan." }] });
		const { http } = mockHttp(() => reply(invented));
		const out = await refineWithAi(approved(), deps(http), points, "id");
		expect(out.status).toBe("unusable");
		expect(out.points).toEqual(points);
		expect(out.rejected.length).toBeGreaterThan(0);
	});

	it("raw HTML, a URL or code in a reply is rejected", async () => {
		const points = basePoints().points;
		const first = points.find(p => p.kind !== "question")!;
		for (const bad of ["<script>alert(1)</script>", "lihat https://evil.example/x", "```js\nx\n```"]) {
			const { http } = mockHttp(() => reply(JSON.stringify({ points: [{ number: first.number, body: bad }] })));
			const out = await refineWithAi(approved(), deps(http), points, "id");
			expect(out.points).toEqual(points);
		}
	});

	it("a failing provider leaves the whole letter as the rules wrote it", async () => {
		const points = basePoints().points;
		const http: HttpClient = { get: () => Promise.reject(new Error("down")), post: () => Promise.reject(new Error("down")) };
		const out = await refineWithAi(approved(), deps(http), points, "id");
		expect(out.status).toBe("error");
		expect(out.points).toEqual(points);
	});

	it("an error never leaks the API key", async () => {
		const points = basePoints().points;
		const http: HttpClient = { get: () => Promise.reject(new Error("x")), post: () => Promise.reject(new Error("failed with key SECRET-KEY-123")) };
		const a = ai({ provider: "api", api: "openai", model: "m", apiKey: "SECRET-KEY-123" });
		const out = await refineWithAi({ ...a, approvedSlot: providerSlot(a) }, deps(http), points, "id");
		expect(out.status).toBe("error");
		expect(JSON.stringify(out)).not.toContain("SECRET-KEY-123");
	});

	it("the cloud key only goes to the configured address", async () => {
		const points = basePoints().points;
		const { http, calls } = mockHttp(() => reply("{}"));
		const a = ai({ provider: "api", api: "openai", model: "m", apiKey: "KEY-1", apiUrl: "https://llm.example.org/v1" });
		await refineWithAi({ ...a, approvedSlot: providerSlot(a) }, deps(http), points, "id");
		expect(calls.every(c => c.url.startsWith("https://llm.example.org/"))).toBe(true);
	});
});
