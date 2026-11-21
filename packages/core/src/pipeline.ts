import { classifyAll, excludeFolders } from "./classify";
import { extractClaims, mergeClaims } from "./claims";
import { buildPoints, renderLetter, suppressedKinds, type LetterMeta, type LetterPoint } from "./compose";
import { analyze, type Analysis } from "./insights";
import { buildThemeWeek, findThemes, themeOf, upsertThemeWeek } from "./themes";
import type { ClassifiedNote, LetterSettings, MemoryState, NoteRecord } from "./types";
import { inPeriod, lastSevenDays, periodWeeksBefore, type Period } from "./week";

export interface PipelineInput {
	notes: NoteRecord[];
	/** Epoch ms of "today"; the period is the 7 days ending today. */
	now: number;
	settings: LetterSettings;
	memory: MemoryState;
	/** Text for the letter frontmatter, e.g. "Mind Letter 0.1.0 (basic mode)". */
	generatedBy: string;
	sources?: string[];
}

export interface PipelineOutput {
	week: string;
	period: Period;
	analysis: Analysis;
	points: LetterPoint[];
	meta: LetterMeta;
	/** Letter Markdown built from the rules alone. */
	markdown: string;
	/** Memory after this letter (new claims, this week's themes). Feedback is not changed here. */
	memory: MemoryState;
	claimsAdded: number;
	classified: ClassifiedNote[];
}

/** Basic mode (no AI): notes + memory in, finished letter + updated memory out. Pure: no I/O, same input = same output. */
export function runPipeline(input: PipelineInput): PipelineOutput {
	const period = lastSevenDays(input.now);
	const classified = classifyAll(excludeFolders(input.notes, input.settings.excludedFolders));
	const ownPeriod = classified.filter(n => n.kind === "own" && inPeriod(n.modified, period));

	const candidates = findThemes(ownPeriod);
	const themeWeek = buildThemeWeek(period.week, candidates, ownPeriod, input.memory.themes);

	const fresh = ownPeriod.flatMap(n => extractClaims(n, themeOf(n, candidates), 1));
	const merged = mergeClaims(input.memory.claims, fresh);
	// link the new claim ids to their theme entries
	for (const c of merged.added) {
		const entry = themeWeek.themes.find(t => t.name === c.theme);
		if (entry) entry.claimIds.push(c.id);
	}

	const analysis = analyze({
		week: period.week,
		period,
		notes: classified,
		themes: candidates,
		history: input.memory.themes,
		claims: merged.claims,
		minOwnForFull: input.settings.minOwnForFull,
		directionWeeks: input.settings.directionWeeks,
	});

	const skip = suppressedKinds(input.memory.feedback);
	const points = buildPoints(analysis, input.settings.lang, skip);
	const meta: LetterMeta = {
		week: period.week,
		firstDay: period.firstDay,
		lastDay: period.lastDay,
		generatedBy: input.generatedBy,
		sources: input.sources ?? ["obsidian"],
	};
	return {
		week: period.week,
		period,
		analysis,
		points,
		meta,
		markdown: renderLetter(meta, points, analysis, input.settings.lang),
		memory: { claims: merged.claims, themes: upsertThemeWeek(input.memory.themes, themeWeek), feedback: input.memory.feedback },
		claimsAdded: merged.added.length,
		classified,
	};
}

/**
 * Warm-up ("pemanasan awal"): read the notes of the previous `weeks` weeks once to seed the theme map and the claim bank,
 * oldest week first so theme status (new / recurring) comes out right. Does not write letters.
 */
export function warmup(input: Omit<PipelineInput, "generatedBy" | "sources">, weeks = 8): MemoryState {
	let memory = input.memory;
	const classified = classifyAll(excludeFolders(input.notes, input.settings.excludedFolders));
	for (let n = weeks; n >= 1; n--) {
		const period = periodWeeksBefore(input.now, n);
		const own = classified.filter(c => c.kind === "own" && inPeriod(c.modified, period));
		if (own.length === 0) continue;
		const candidates = findThemes(own);
		const week = buildThemeWeek(period.week, candidates, own, memory.themes);
		const fresh = own.flatMap(c => extractClaims(c, themeOf(c, candidates), 1));
		const merged = mergeClaims(memory.claims, fresh);
		for (const c of merged.added) week.themes.find(t => t.name === c.theme)?.claimIds.push(c.id);
		memory = { claims: merged.claims, themes: upsertThemeWeek(memory.themes, week), feedback: memory.feedback };
	}
	return memory;
}
