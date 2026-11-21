import type { ClassifiedNote, ThemeEntry, ThemeWeek } from "./types";
import { tokenize } from "./text";

/** Frontmatter that marks a note as finished writing: a published/mature piece rather than a raw thought. */
const MATURE_STATUS = /^(published|mature|done|final|terbit|selesai|matang)$/i;
const MATURE_TYPE = /^(essay|article|post|essai|tulisan|artikel|blog)$/i;
const MATURE_FOLDERS = ["published", "terbit", "essays", "tulisan", "blog", "posts", "publish"];

export function isMature(note: Pick<ClassifiedNote, "path" | "frontmatter">): boolean {
	const fm = note.frontmatter;
	if (fm && (MATURE_STATUS.test(fm["status"] ?? "") || MATURE_TYPE.test(fm["type"] ?? ""))) return true;
	const folders = note.path.toLowerCase().split(/[\\/]/).slice(0, -1);
	return folders.some(f => MATURE_FOLDERS.includes(f));
}

/** Terms of a note with their theme weight: tags and title count more than body words. */
export function themeTerms(note: ClassifiedNote): Map<string, number> {
	const terms = new Map<string, number>();
	const add = (t: string, w: number) => terms.set(t, (terms.get(t) ?? 0) + w);
	for (const tag of note.tags) {
		for (const t of tokenize(tag.replace(/^#/, "").replace(/[/_-]/g, " "))) add(t, 4);
	}
	for (const t of tokenize(note.title)) add(t, 3);
	const body = tokenize(note.body.slice(0, 6000));
	for (const t of body) add(t, 1);
	return terms;
}

export interface ThemeCandidate {
	name: string;
	notes: ClassifiedNote[];
}

/**
 * Group this period's own notes by the keyword they are most about. A keyword becomes a theme when at least
 * two own notes share it (one note on its own is a topic, not a theme), unless there are fewer than two notes.
 */
export function findThemes(own: ClassifiedNote[], maxThemes = 6): ThemeCandidate[] {
	if (own.length === 0) return [];
	const perNote = own.map(n => themeTerms(n));
	// document frequency: in how many notes does a term appear with real weight (title/tag, or 2+ body hits)?
	const df = new Map<string, number>();
	const score = new Map<string, number>();
	perNote.forEach(terms => {
		for (const [t, w] of terms) {
			if (w >= 2) {
				df.set(t, (df.get(t) ?? 0) + 1);
				score.set(t, (score.get(t) ?? 0) + w);
			}
		}
	});
	const minDf = own.length >= 2 ? 2 : 1;
	const ranked = [...df.entries()]
		.filter(([, d]) => d >= minDf)
		.sort((a, b) => b[1] - a[1] || (score.get(b[0]) ?? 0) - (score.get(a[0]) ?? 0) || a[0].localeCompare(b[0]));

	const themes: ThemeCandidate[] = [];
	const taken = new Set<number>();
	for (const [term] of ranked) {
		const members: number[] = [];
		perNote.forEach((terms, i) => {
			if ((terms.get(term) ?? 0) >= 2 && !taken.has(i)) members.push(i);
		});
		if (members.length < minDf) continue;
		members.forEach(i => taken.add(i));
		themes.push({ name: term, notes: members.map(i => own[i] as ClassifiedNote) });
		if (themes.length >= maxThemes) break;
	}
	return themes;
}

/** Name of the theme a note belongs to, or "" when none of the found themes covers it. */
export function themeOf(note: ClassifiedNote, themes: ThemeCandidate[]): string {
	return themes.find(t => t.notes.some(n => n.id === note.id))?.name ?? "";
}

/**
 * Build the theme list of a week with status against the history: `recurring` when the same theme was in the
 * previous week, `done` when this week's notes on it include a finished (mature) piece, otherwise `new`.
 */
export function buildThemeWeek(week: string, candidates: ThemeCandidate[], own: ClassifiedNote[], history: ThemeWeek[]): ThemeWeek {
	const previous = latestBefore(week, history);
	const prevNames = new Set((previous?.themes ?? []).map(t => t.name));
	const total = Math.max(1, own.length);
	const themes: ThemeEntry[] = candidates.map(c => ({
		name: c.name,
		weight: Math.round((c.notes.length / total) * 100) / 100,
		status: c.notes.some(n => isMature(n)) ? "done" : prevNames.has(c.name) ? "recurring" : "new",
		claimIds: [],
	}));
	return { week, themes };
}

/** Most recent history entry that is older than `week` (labels sort lexicographically as YYYY-Www). */
export function latestBefore(week: string, history: ThemeWeek[]): ThemeWeek | undefined {
	return history.filter(h => h.week < week).sort((a, b) => (a.week < b.week ? 1 : -1))[0];
}

/** Replace the entry of the same week or append, keeping at most `limit` weeks in the history. */
export function upsertThemeWeek(history: ThemeWeek[], entry: ThemeWeek, limit = 60): ThemeWeek[] {
	const rest = history.filter(h => h.week !== entry.week);
	return [...rest, entry].sort((a, b) => (a.week < b.week ? -1 : 1)).slice(-limit);
}

/**
 * How many weeks in a row, ending the week before `week`, a theme was present. The current week is not counted:
 * add one when the theme is also in this week's notes.
 */
export function consecutiveWeeksBefore(name: string, week: string, history: ThemeWeek[]): number {
	const past = history.filter(h => h.week < week).sort((a, b) => (a.week < b.week ? 1 : -1));
	let n = 0;
	let expected = previousWeekLabel(week);
	for (const h of past) {
		if (h.week !== expected) break; // a gap ends the streak
		if (!h.themes.some(t => t.name === name && t.status !== "done")) break;
		n++;
		expected = previousWeekLabel(h.week);
	}
	return n;
}

/** Label of the ISO week before `label` (handles the year boundary through a Thursday anchor). */
export function previousWeekLabel(label: string): string {
	const m = /^(\d{4})-W(\d{2})$/.exec(label);
	if (!m) return "";
	const year = Number(m[1]);
	const week = Number(m[2]);
	if (week > 1) return `${year}-W${String(week - 1).padStart(2, "0")}`;
	// week 1 -> last week of the previous year (52 or 53): the week containing 28 December is always the last one
	const lastDec = new Date(Date.UTC(year - 1, 11, 28));
	const dayNum = (lastDec.getUTCDay() + 6) % 7;
	lastDec.setUTCDate(lastDec.getUTCDate() - dayNum + 3);
	const firstThursday = new Date(Date.UTC(lastDec.getUTCFullYear(), 0, 4));
	const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
	firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
	const last = 1 + Math.round((lastDec.getTime() - firstThursday.getTime()) / (7 * 86400000));
	return `${year - 1}-W${String(last).padStart(2, "0")}`;
}
