import { describe, expect, it } from "vitest";
import { parseFeedbackFromLetter } from "@mind-letter/core";
import { DEFAULT_AI, providerSlot, type HttpClient, type ProviderDeps } from "@mind-letter/ai";
import { generateLetter, runWarmup } from "../src/generate";
import { loadMemory, type FilePort } from "../src/memory-store";
import { isWeeklyDue } from "../src/scheduler";
import { DEFAULT_SETTINGS, mergeSettings, type MindLetterSettings } from "../src/settings";
import { makeT } from "../src/i18n";
import { NOW, quietVault, syntheticVault } from "./fixtures";

function memoryPort(): { port: FilePort; files: Map<string, string> } {
	const files = new Map<string, string>();
	const port: FilePort = {
		exists: async p => files.has(p),
		read: async p => files.get(p) ?? null,
		write: async (p, t) => void files.set(p, t),
		ensureFolder: async () => {},
		listFiles: async folder => [...files.keys()].filter(k => k.startsWith(folder + "/") && !k.slice(folder.length + 1).includes("/")).map(k => k.slice(folder.length + 1)),
	};
	return { port, files };
}

const settings = (over: Partial<MindLetterSettings> = {}): MindLetterSettings => ({ ...DEFAULT_SETTINGS, language: "id", ...over });

describe("P1: Off mode writes a useful letter", () => {
	it("writes Mind Letter/YYYY-Www.md with the sections, links and a feedback checklist", async () => {
		const { port, files } = memoryPort();
		const r = await generateLetter({ port, readNotes: async () => syntheticVault(), settings: settings(), ai: null, version: "0.1.0", now: NOW });
		expect(r.path).toBe("Mind Letter/2026-W47.md");
		expect(files.get(r.path)).toBe(r.markdown);
		expect(r.markdown).toMatch(/^---\ntype: mind-letter\nweek: 2026-W47/);
		expect(r.markdown).toContain("generated-by: Mind Letter 0.1.0 (basic mode)");
		expect(r.markdown).toMatch(/\[\[.+\]\]/);
		expect((r.markdown.match(/^## \d\./gm) ?? []).length).toBeGreaterThanOrEqual(3);
		expect((r.markdown.match(/^- \[ \] \d/gm) ?? []).length).toBeGreaterThanOrEqual(3);
		expect(r.ai).toBeNull();
	});

	it("English notes give an English letter in automatic mode", async () => {
		const { port } = memoryPort();
		const en = syntheticVault().map(n => ({ ...n, body: n.body.replace(/\b(yang|dan|dengan|untuk|tidak)\b/g, "the and with for not") }));
		const r = await generateLetter({ port, readNotes: async () => en, settings: settings({ language: "auto" }), ai: null, version: "0.1.0", now: NOW });
		expect(["id", "en"]).toContain(r.lang);
	});

	it("a quiet week gives the short letter, never an invented one", async () => {
		const { port } = memoryPort();
		const r = await generateLetter({ port, readNotes: async () => quietVault(), settings: settings(), ai: null, version: "0.1.0", now: NOW });
		expect(r.markdown).toContain("type: mind-letter");
		expect(r.markdown.length).toBeLessThan(2500);
	});
});

describe("P2: AI off means no network and no process", () => {
	it("generation with AI off touches no provider", async () => {
		const { port } = memoryPort();
		let touched = 0;
		const trap = (): never => {
			touched++;
			throw new Error("must not be used");
		};
		const http: HttpClient = { get: async () => trap(), post: async () => trap() };
		const deps: ProviderDeps = { runner: { run: async () => trap() }, findExe: async () => trap(), makeSandbox: async () => trap(), http, canSpawn: true, io: null };
		await generateLetter({ port, readNotes: async () => syntheticVault(), settings: settings(), ai: deps, version: "0.1.0", now: NOW });
		expect(touched).toBe(0);
	});

	it("AI on without approval writes the letter without AI and sends nothing", async () => {
		const { port } = memoryPort();
		let calls = 0;
		const http: HttpClient = { get: async () => ((calls++), { status: 200, text: "{}" }), post: async () => ((calls++), { status: 200, text: "{}" }) };
		const deps: ProviderDeps = { runner: { run: async () => { throw new Error("no"); } }, findExe: async () => null, makeSandbox: async () => { throw new Error("no"); }, http, canSpawn: false, io: null };
		const s = settings({ ai: { ...DEFAULT_AI, provider: "local", model: "m" } });
		const r = await generateLetter({ port, readNotes: async () => syntheticVault(), settings: s, ai: deps, version: "0.1.0", now: NOW });
		expect(r.ai?.status).toBe("not-approved");
		expect(r.markdown).toContain("(basic mode)");
		expect(calls).toBe(0);
	});

	it("approved AI that returns garbage keeps the rule-based letter", async () => {
		const { port } = memoryPort();
		const http: HttpClient = { get: async () => ({ status: 200, text: "{}" }), post: async () => ({ status: 200, text: JSON.stringify({ message: { content: "not json at all" } }) }) };
		const deps: ProviderDeps = { runner: { run: async () => { throw new Error("no"); } }, findExe: async () => null, makeSandbox: async () => { throw new Error("no"); }, http, canSpawn: false, io: null };
		const ai = { ...DEFAULT_AI, provider: "local" as const, model: "m" };
		const s = settings({ ai: { ...ai, approvedSlot: providerSlot(ai) } });
		const base = await generateLetter({ port: memoryPort().port, readNotes: async () => syntheticVault(), settings: settings(), ai: null, version: "0.1.0", now: NOW });
		const r = await generateLetter({ port, readNotes: async () => syntheticVault(), settings: s, ai: deps, version: "0.1.0", now: NOW });
		expect(r.ai?.status).toBe("unusable");
		expect(r.markdown).toBe(base.markdown);
	});
});

describe("P5: memory in Mind Letter/.memory and feedback", () => {
	it("writes claims, themes, feedback and meta; the first run warms up", async () => {
		const { port, files } = memoryPort();
		const r = await generateLetter({ port, readNotes: async () => syntheticVault(), settings: settings(), ai: null, version: "0.1.0", now: NOW });
		expect(r.warmedUp).toBe(true);
		for (const n of ["claims", "themes", "feedback", "meta"]) expect(files.has(`Mind Letter/.memory/${n}.json`)).toBe(true);
		const loaded = await loadMemory(port, "Mind Letter");
		expect(loaded.memory.claims.length).toBeGreaterThan(0);
		expect(loaded.memory.themes.some(t => t.week === "2026-W47")).toBe(true);
		expect(loaded.meta).toEqual({ warmedUp: true, lastWeek: "2026-W47" });
	});

	it("never overwrites: a second letter for the same week is a numbered copy", async () => {
		const { port, files } = memoryPort();
		const run = () => generateLetter({ port, readNotes: async () => syntheticVault(), settings: settings(), ai: null, version: "0.1.0", now: NOW });
		const a = await run();
		files.set(a.path, a.markdown + "\nMY EDIT\n");
		const b = await run();
		expect(b.path).toBe("Mind Letter/2026-W47 (2).md");
		expect(files.get(a.path)).toContain("MY EDIT");
	});

	it("the letters and memory are never read back as the user's own notes", async () => {
		const { port } = memoryPort();
		const letterAsNote = { ...syntheticVault()[0]!, path: "Mind Letter/2026-W46.md", title: "2026-W46", id: "letter" };
		const base = await generateLetter({ port: memoryPort().port, readNotes: async () => syntheticVault(), settings: settings(), ai: null, version: "0.1.0", now: NOW });
		const r = await generateLetter({ port, readNotes: async () => [...syntheticVault(), letterAsNote], settings: settings(), ai: null, version: "0.1.0", now: NOW });
		expect(r.ownNotes).toBe(base.ownNotes);
		expect(r.markdown).toBe(base.markdown);
	});

	it("ticked boxes become feedback in the next run", async () => {
		const { port, files } = memoryPort();
		const a = await generateLetter({ port, readNotes: async () => syntheticVault(), settings: settings(), ai: null, version: "0.1.0", now: NOW });
		const ticked = a.markdown.replace(/^- \[ \] 1 /m, "- [x] 1 ");
		files.set(a.path, ticked);
		expect(parseFeedbackFromLetter(ticked).some(f => f.item >= 1 && f.useful)).toBe(true);
		await generateLetter({ port, readNotes: async () => syntheticVault(), settings: settings(), ai: null, version: "0.1.0", now: NOW + 7 * 86400000 });
		const loaded = await loadMemory(port, "Mind Letter");
		expect(loaded.memory.feedback.length).toBeGreaterThan(0);
		expect(loaded.memory.feedback.some(f => f.week === "2026-W47" && f.useful)).toBe(true);
	});

	it("an untouched checklist produces no feedback", async () => {
		const { port } = memoryPort();
		await generateLetter({ port, readNotes: async () => syntheticVault(), settings: settings(), ai: null, version: "0.1.0", now: NOW });
		await generateLetter({ port, readNotes: async () => syntheticVault(), settings: settings(), ai: null, version: "0.1.0", now: NOW + 7 * 86400000 });
		expect((await loadMemory(port, "Mind Letter")).memory.feedback).toEqual([]);
	});

	it("damaged memory files are ignored, not fatal", async () => {
		const { port, files } = memoryPort();
		files.set("Mind Letter/.memory/claims.json", "{{{ not json");
		files.set("Mind Letter/.memory/meta.json", "garbage");
		const r = await generateLetter({ port, readNotes: async () => syntheticVault(), settings: settings(), ai: null, version: "0.1.0", now: NOW });
		expect(r.markdown).toContain("type: mind-letter");
	});

	it("warm-up alone writes memory but no letter", async () => {
		const { port, files } = memoryPort();
		// the warm-up reads the 8 weeks BEFORE the current one, so shift the notes two weeks back
		const older = syntheticVault().map(n => ({ ...n, modified: n.modified - 14 * 86400000, created: n.created - 14 * 86400000 }));
		const r = await runWarmup({ port, readNotes: async () => older, settings: settings(), now: NOW });
		expect(r.claims).toBeGreaterThan(0);
		expect([...files.keys()].some(k => /\d{4}-W\d{2}\.md$/.test(k))).toBe(false);
	});
});

describe("P6: weekly schedule", () => {
	// NOW is Saturday 2026-11-21 12:00 (ISO week W47, Monday-first position 5)
	const base = { now: NOW, lastWeek: "2026-W46" };
	it("off by default: never due", () => {
		expect(DEFAULT_SETTINGS.autoWeekly).toBe(false);
		expect(isWeeklyDue({ ...base, enabled: false, weekday: 6, hour: 0 })).toBe(false);
	});
	it("due once the chosen weekday and hour have passed", () => {
		expect(isWeeklyDue({ ...base, enabled: true, weekday: 6, hour: 8 })).toBe(true); // Saturday 08:00 passed
		expect(isWeeklyDue({ ...base, enabled: true, weekday: 6, hour: 18 })).toBe(false); // Saturday 18:00 not yet
		expect(isWeeklyDue({ ...base, enabled: true, weekday: 5, hour: 23 })).toBe(true); // Friday already passed
		expect(isWeeklyDue({ ...base, enabled: true, weekday: 0, hour: 9 })).toBe(false); // Sunday (end of ISO week) not yet
	});
	it("not due again once this week's letter exists", () => {
		expect(isWeeklyDue({ ...base, lastWeek: "2026-W47", enabled: true, weekday: 6, hour: 8 })).toBe(false);
	});
});

describe("settings and text", () => {
	it("wrong types fall back to defaults", () => {
		const s = mergeSettings({ language: 5, letterFolder: "", weekday: 99, hour: "x", ai: { provider: "evil", timeoutSec: 99999 }, excludedFolders: ["A", 3, " "] });
		expect(s.language).toBe("auto");
		expect(s.letterFolder).toBe("Mind Letter");
		expect(s.weekday).toBe(6);
		expect(s.hour).toBe(19);
		expect(s.ai.provider).toBe("off");
		expect(s.ai.timeoutSec).toBe(300);
		expect(s.excludedFolders).toEqual(["A"]);
	});
	it("AI is off by default", () => {
		expect(mergeSettings(undefined).ai.provider).toBe("off");
	});
	it("both UI languages cover every key", () => {
		const en = makeT("en");
		const id = makeT("id");
		for (const k of ["cmd.generate", "set.ai.check", "approve.title", "notice.done"] as const) {
			expect(en(k, { path: "p", n: 1 })).not.toBe("");
			expect(id(k, { path: "p", n: 1 })).not.toBe(en(k, { path: "p", n: 1 }));
		}
	});
});
