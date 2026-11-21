import {
	DEFAULT_LETTER_SETTINGS,
	guessLanguage,
	renderLetter,
	runPipeline,
	warmup,
	type Lang,
	type NoteRecord,
} from "@mind-letter/core";
import { refineWithAi, type AiRefineOutcome, type AiSettings, type ProviderDeps } from "@mind-letter/ai";
import { collectFeedback, freeLetterPath, loadMemory, saveMemory, type FilePort } from "./memory-store";
import type { MindLetterSettings } from "./settings";

export interface GenerateDeps {
	port: FilePort;
	readNotes(): Promise<NoteRecord[]>;
	settings: MindLetterSettings;
	/** Provider environment for the AI layer; null when it cannot be built (then AI is skipped). */
	ai: ProviderDeps | null;
	version: string;
	now: number;
}

export interface GenerateResult {
	path: string;
	week: string;
	lang: Lang;
	markdown: string;
	warmedUp: boolean;
	ai: AiRefineOutcome | null;
	ownNotes: number;
}

function pickLanguage(setting: MindLetterSettings["language"], notes: NoteRecord[]): Lang {
	if (setting !== "auto") return setting;
	const sample = notes
		.slice()
		.sort((a, b) => b.modified - a.modified)
		.slice(0, 120)
		.map(n => n.body.slice(0, 400));
	return guessLanguage(sample);
}

function generatedBy(version: string, ai: AiRefineOutcome | null): string {
	if (ai && ai.status === "ok") return `Mind Letter ${version} (AI: ${ai.provider ?? "provider"}, rules first)`;
	return `Mind Letter ${version} (basic mode)`;
}

/**
 * One letter, end to end: read notes -> read ticked feedback from earlier letters -> (first time) warm up the theme map ->
 * rules write the letter -> optional AI rewording -> save the letter and the memory.
 * The letter is complete before any AI is involved; the AI can only improve wording or be skipped.
 */
export async function generateLetter(deps: GenerateDeps): Promise<GenerateResult> {
	const { port, settings } = deps;
	const folder = settings.letterFolder;
	const notes = await deps.readNotes();
	const lang = pickLanguage(settings.language, notes);
	const letterSettings = {
		...DEFAULT_LETTER_SETTINGS,
		lang,
		// the letters and the memory are written by this plugin: never read them back as the user's own notes
		excludedFolders: [...settings.excludedFolders, folder],
	};

	const loaded = await loadMemory(port, folder);
	let memory = await collectFeedback(port, folder, loaded.memory);
	let warmed = false;
	if (!loaded.meta.warmedUp) {
		memory = warmup({ notes, now: deps.now, settings: letterSettings, memory });
		warmed = true;
	}

	const out = runPipeline({ notes, now: deps.now, settings: letterSettings, memory, generatedBy: generatedBy(deps.version, null) });

	let ai: AiRefineOutcome | null = null;
	let markdown = out.markdown;
	if (settings.ai.provider !== "off" && deps.ai) {
		ai = await refineWithAi(settings.ai, deps.ai, out.points, lang);
		if (ai.status === "ok") {
			markdown = renderLetter({ ...out.meta, generatedBy: generatedBy(deps.version, ai) }, ai.points, out.analysis, lang);
		}
	}

	const path = await freeLetterPath(port, folder, out.week);
	await port.ensureFolder(folder);
	await port.write(path, markdown);
	await saveMemory(port, folder, out.memory, { warmedUp: true, lastWeek: out.week });
	return { path, week: out.week, lang, markdown, warmedUp: warmed, ai, ownNotes: out.classified.filter(n => n.kind === "own").length };
}

/** Seed the theme map and claim bank from the past 8 weeks without writing a letter. */
export async function runWarmup(deps: Omit<GenerateDeps, "ai" | "version">): Promise<{ weeks: number; claims: number }> {
	const { port, settings } = deps;
	const notes = await deps.readNotes();
	const lang = pickLanguage(settings.language, notes);
	const loaded = await loadMemory(port, settings.letterFolder);
	const memory = warmup({
		notes,
		now: deps.now,
		settings: { ...DEFAULT_LETTER_SETTINGS, lang, excludedFolders: [...settings.excludedFolders, settings.letterFolder] },
		memory: loaded.memory,
	});
	await saveMemory(port, settings.letterFolder, memory, { warmedUp: true, lastWeek: loaded.meta.lastWeek });
	return { weeks: memory.themes.length, claims: memory.claims.length };
}

export type { AiSettings };
