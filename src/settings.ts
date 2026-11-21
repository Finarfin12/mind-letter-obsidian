import { DEFAULT_AI, type AiSettings, type ApiKind, type CliTool, type LocalKind, type ProviderMode } from "@mind-letter/ai";

export type LanguageSetting = "auto" | "id" | "en";

export interface MindLetterSettings {
	language: LanguageSetting;
	/** Folder (vault path) where letters and the memory are written. */
	letterFolder: string;
	/** Folders whose notes are never read. */
	excludedFolders: string[];
	/** Write a letter automatically once a week (off by default: the plugin writes only when you ask). */
	autoWeekly: boolean;
	/** 0 = Sunday ... 6 = Saturday */
	weekday: number;
	hour: number;
	ai: AiSettings;
}

export const DEFAULT_SETTINGS: MindLetterSettings = {
	language: "auto",
	letterFolder: "Mind Letter",
	excludedFolders: [],
	autoWeekly: false,
	weekday: 0,
	hour: 19,
	ai: DEFAULT_AI,
};

const str = (v: unknown, d: string): string => (typeof v === "string" ? v : d);
const num = (v: unknown, d: number, min: number, max: number): number => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : d);
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], d: T): T => (allowed.includes(v as T) ? (v as T) : d);

/** Merge saved data over the defaults; anything of the wrong type falls back to its default. */
export function mergeSettings(raw: unknown): MindLetterSettings {
	const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
	const a = (typeof r["ai"] === "object" && r["ai"] !== null ? r["ai"] : {}) as Record<string, unknown>;
	const d = DEFAULT_SETTINGS;
	const folders = Array.isArray(r["excludedFolders"]) ? (r["excludedFolders"] as unknown[]).filter((x): x is string => typeof x === "string" && x.trim() !== "") : [];
	const ai: AiSettings = {
		provider: oneOf<ProviderMode>(a["provider"], ["off", "cli", "local", "api"], d.ai.provider),
		cli: oneOf<CliTool>(a["cli"], ["claude", "codex", "gemini", "agy"], d.ai.cli),
		local: oneOf<LocalKind>(a["local"], ["ollama", "lmstudio"], d.ai.local),
		localUrl: str(a["localUrl"], "").trim(),
		api: oneOf<ApiKind>(a["api"], ["openai", "anthropic", "gemini"], d.ai.api),
		apiUrl: str(a["apiUrl"], "").trim(),
		apiKey: str(a["apiKey"], ""),
		model: str(a["model"], "").trim(),
		approvedSlot: str(a["approvedSlot"], ""),
		timeoutSec: num(a["timeoutSec"], d.ai.timeoutSec, 10, 300),
		maxContextChars: num(a["maxContextChars"], d.ai.maxContextChars, 1000, 20000),
	};
	return {
		language: oneOf<LanguageSetting>(r["language"], ["auto", "id", "en"], d.language),
		letterFolder: str(r["letterFolder"], d.letterFolder).trim().replace(/^\/+|\/+$/g, "") || d.letterFolder,
		excludedFolders: folders,
		autoWeekly: r["autoWeekly"] === true,
		weekday: num(r["weekday"], d.weekday, 0, 6),
		hour: num(r["hour"], d.hour, 0, 23),
		ai,
	};
}
