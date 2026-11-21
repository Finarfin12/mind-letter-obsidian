import type { Claim, ClassifiedNote, Evidence, NoteLink, ThemeWeek } from "./types";
import { isSaved } from "./classify";
import { consecutiveWeeksBefore, isMature, type ThemeCandidate } from "./themes";
import { containsQuote, cosine, sharedTerms, termFrequency, tokenize } from "./text";
import { parseDay } from "./week";

/** Insights in language-free form. compose.ts turns them into sentences; the AI layer may reword them, never invent them. */

export const linkOf = (n: Pick<ClassifiedNote, "title" | "path">): NoteLink => ({ title: n.title, path: n.path });

export interface CrossInsight {
	theme: string;
	/** Weeks in a row the theme was present, including this one. */
	weeks: number;
	noteCount: number;
	folders: string[];
	notes: NoteLink[];
	hasMature: boolean;
	/** Older own notes close to the theme. */
	oldRelated: NoteLink[];
}

export type ContradictionTopic = "claims" | "focus" | "capture";

export interface ContradictionInsight {
	topic: ContradictionTopic;
	/** What the person wrote: an exact quote with its note. */
	rule: Extract<Evidence, { type: "quote" }>;
	/** What the notes show: a second exact quote, or a measured count. */
	against: Evidence;
}

export interface ThreadPair {
	a: NoteLink;
	b: NoteLink;
	similarity: number;
	shared: string[];
}

export interface ThreadsInsight {
	unlinked: ThreadPair[];
	duplicates: Array<{ a: NoteLink; b: NoteLink; reason: "title" | "content" }>;
	overdue: Array<{ note: NoteLink; due: string }>;
}

export interface HoardingInsight {
	saved: number;
	own: number;
	pdfStubs: NoteLink[];
	reading?: { note: NoteLink; theme: string };
}

export type QuestionVariant = "rule" | "direction" | "theme" | "generic";

export interface QuestionInsight {
	variant: QuestionVariant;
	rule?: string;
	theme?: string;
}

export interface Analysis {
	week: string;
	period: { firstDay: string; lastDay: string };
	/** True when there were fewer own notes than the full letter needs. */
	short: boolean;
	/** Weeks a theme must keep coming back to count as direction. */
	directionWeeks: number;
	stats: { changed: number; own: number; saved: number; pdfStubs: number; themes: number };
	cross?: CrossInsight;
	contradiction?: ContradictionInsight;
	threads?: ThreadsInsight;
	hoarding?: HoardingInsight;
	question: QuestionInsight;
	/** Short version only. */
	shortThread?: { note: NoteLink; why: "overdue" | "related" | "recent" };
}

export interface AnalysisInput {
	week: string;
	period: { from: number; to: number; firstDay: string; lastDay: string };
	/** Every readable note (after folder exclusion), classified. */
	notes: ClassifiedNote[];
	themes: ThemeCandidate[];
	history: ThemeWeek[];
	/** Claim bank including this week's new claims. */
	claims: Claim[];
	minOwnForFull: number;
	directionWeeks: number;
}

const inPeriod = (n: ClassifiedNote, p: { from: number; to: number }): boolean => n.modified >= p.from && n.modified < p.to;

function folderOf(path: string): string {
	const parts = path.replace(/\\/g, "/").split("/");
	return parts.length > 1 ? (parts[0] as string) : "(root)";
}

const baseName = (path: string): string => (path.replace(/\\/g, "/").split("/").pop() ?? path).replace(/\.md$/i, "");

const normTitle = (t: string): string => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

/** Does `from` link to `to` (by title, file name or path, with or without ".md")? */
export function linksTo(from: ClassifiedNote, to: ClassifiedNote): boolean {
	const targets = new Set([normTitle(to.title), normTitle(baseName(to.path)), normTitle(to.path.replace(/\.md$/i, ""))]);
	return from.links.some(l => targets.has(normTitle(l.split("|")[0]?.split("#")[0] ?? "")));
}

function theme(noteSet: ClassifiedNote[]): Map<string, number> {
	const tf = new Map<string, number>();
	for (const n of noteSet) for (const [t, c] of termFrequency(tokenize(n.title + " " + n.body.slice(0, 6000)))) tf.set(t, (tf.get(t) ?? 0) + c);
	return tf;
}

// ---------------- cross / direction ----------------

export function findCross(input: AnalysisInput, ownAll: ClassifiedNote[]): CrossInsight | undefined {
	const best = [...input.themes].sort((a, b) => b.notes.length - a.notes.length)[0];
	if (!best || best.notes.length < 2) return undefined;
	const streak = consecutiveWeeksBefore(best.name, input.week, input.history) + 1;
	const folders = [...new Set(best.notes.map(n => folderOf(n.path)))];
	const vector = theme(best.notes);
	const inTheme = new Set(best.notes.map(n => n.id));
	const old = ownAll
		.filter(n => !inTheme.has(n.id) && !inPeriod(n, input.period))
		.map(n => ({ n, score: cosine(vector, termFrequency(tokenize(n.title + " " + n.body.slice(0, 4000)))) }))
		.filter(x => x.score >= 0.12)
		.sort((a, b) => b.score - a.score)
		.slice(0, 3)
		.map(x => linkOf(x.n));
	// "finished writing" = a mature piece on the theme, this week or earlier
	const hasMature =
		best.notes.some(n => isMature(n)) ||
		ownAll.some(n => isMature(n) && tokenize(n.title).includes(best.name));
	return { theme: best.name, weeks: streak, noteCount: best.notes.length, folders, notes: best.notes.slice(0, 4).map(linkOf), hasMature, oldRelated: old };
}

// ---------------- loose threads ----------------

const DUPLICATE_COSINE = 0.85;
const RELATED_COSINE = 0.3;
const RELATED_MIN_SHARED = 6;

export function findThreads(input: AnalysisInput, ownAll: ClassifiedNote[], ownPeriod: ClassifiedNote[]): ThreadsInsight | undefined {
	const tfCache = new Map<string, Map<string, number>>();
	const tfOf = (n: ClassifiedNote): Map<string, number> => {
		let tf = tfCache.get(n.id);
		if (!tf) {
			tf = termFrequency(tokenize(n.title + " " + n.body.slice(0, 5000)));
			tfCache.set(n.id, tf);
		}
		return tf;
	};

	const duplicates: ThreadsInsight["duplicates"] = [];
	const dupKeys = new Set<string>();
	const pairKey = (a: ClassifiedNote, b: ClassifiedNote): string => (a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`);

	// same title in two places
	const byTitle = new Map<string, ClassifiedNote[]>();
	for (const n of ownAll) {
		const key = normTitle(n.title);
		if (key.length < 4) continue;
		byTitle.set(key, [...(byTitle.get(key) ?? []), n]);
	}
	for (const group of byTitle.values()) {
		if (group.length < 2 || !group.some(n => inPeriod(n, input.period))) continue;
		const [a, b] = group.sort((x, y) => y.modified - x.modified) as [ClassifiedNote, ClassifiedNote];
		duplicates.push({ a: linkOf(a), b: linkOf(b), reason: "title" });
		dupKeys.add(pairKey(a, b));
	}

	const unlinked: ThreadPair[] = [];
	for (const a of ownPeriod) {
		const ta = tfOf(a);
		for (const b of ownAll) {
			if (a.id === b.id) continue;
			if (inPeriod(b, input.period) && b.id < a.id) continue; // count a pair of period notes once
			const key = pairKey(a, b);
			if (dupKeys.has(key)) continue;
			const sim = cosine(ta, tfOf(b));
			if (sim >= DUPLICATE_COSINE && Math.min(a.body.length, b.body.length) > 80) {
				duplicates.push({ a: linkOf(a), b: linkOf(b), reason: "content" });
				dupKeys.add(key);
				continue;
			}
			if (sim < RELATED_COSINE) continue;
			const shared = sharedTerms(ta, tfOf(b));
			if (shared.length < RELATED_MIN_SHARED) continue;
			if (linksTo(a, b) || linksTo(b, a)) continue;
			unlinked.push({ a: linkOf(a), b: linkOf(b), similarity: Math.round(sim * 100) / 100, shared: shared.slice(0, 5) });
		}
	}
	unlinked.sort((x, y) => y.similarity - x.similarity);

	// reviews that are overdue (frontmatter "review" / "next-review" / "review-date")
	const overdue: ThreadsInsight["overdue"] = [];
	for (const n of ownAll) {
		const raw = n.frontmatter?.["review"] ?? n.frontmatter?.["next-review"] ?? n.frontmatter?.["review-date"];
		const due = raw ? parseDay(raw) : null;
		if (due !== null && due < input.period.to - 86400000) overdue.push({ note: linkOf(n), due: raw?.slice(0, 10) ?? "" });
	}
	overdue.sort((x, y) => (x.due < y.due ? 1 : -1));

	const result: ThreadsInsight = { unlinked: unlinked.slice(0, 3), duplicates: duplicates.slice(0, 3), overdue: overdue.slice(0, 2) };
	return result.unlinked.length + result.duplicates.length + result.overdue.length > 0 ? result : undefined;
}

// ---------------- hoarding ----------------

export function findHoarding(input: AnalysisInput, notes: ClassifiedNote[], ownPeriodCount: number): HoardingInsight | undefined {
	const savedPeriod = notes.filter(n => inPeriod(n, input.period) && isSaved(n.kind));
	const pdfStubs = savedPeriod.filter(n => n.kind === "pdf-stub");
	if (savedPeriod.length < 3 && pdfStubs.length < 2) return undefined;

	// One reading: the saved text closest to the dominant theme, or failing that the newest saved text.
	const best = [...input.themes].sort((a, b) => b.notes.length - a.notes.length)[0];
	const readable = notes.filter(n => (n.kind === "clipping" || n.kind === "book") && n.body.trim().length > 200);
	let reading: HoardingInsight["reading"];
	if (best) {
		const vector = theme(best.notes);
		const scored = readable
			.map(n => ({ n, score: cosine(vector, termFrequency(tokenize(n.title + " " + n.body.slice(0, 4000)))) }))
			.filter(x => x.score >= 0.08)
			.sort((a, b) => b.score - a.score);
		if (scored[0]) reading = { note: linkOf(scored[0].n), theme: best.name };
	}
	return { saved: savedPeriod.length, own: ownPeriodCount, pdfStubs: pdfStubs.slice(0, 5).map(linkOf), reading };
}

// ---------------- contradiction ----------------

const FOCUS_RULE = /\b(?:satu|1)\s+(?:topik|fokus)\b|\bone\s+(?:topic|focus)\b|\bhanya\s+satu\s+(?:fokus|topik)\b|\bparkir(?:kan)?\b/i;
const CAPTURE_RULE = /\btampung\b|\bjangan\s+(?:menimbun|menumpuk|langsung\s+kejar)\b|\bbaca\s+dulu\s+sebelum\b|\bread\s+before\s+(?:you\s+)?sav|\bdon'?t\s+(?:hoard|pile|collect\s+more)\b/i;
const NEGATION = /\b(?:jangan|tidak\s+(?:boleh|perlu)|dilarang|never|do\s+not|don't|avoid)\b/i;

function quoteEvidence(claim: Claim, notesByPath: Map<string, ClassifiedNote>): Extract<Evidence, { type: "quote" }> | undefined {
	const note = notesByPath.get(claim.ref);
	// A quote that cannot be found word for word in its note is never used
	if (!note || !containsQuote(note.body, claim.quote)) return undefined;
	return { type: "quote", quote: claim.quote, note: linkOf(note) };
}

export function findContradiction(input: AnalysisInput, notes: ClassifiedNote[], ownPeriodCount: number): ContradictionInsight | undefined {
	const notesByPath = new Map(notes.map(n => [n.path, n]));
	const rules = input.claims.filter(c => c.kind === "rule");

	// 1. claim vs claim: a "never X" and an "I will / should X" that share most of their content words
	const periodDates = new Set<string>();
	for (const n of notes) if (inPeriod(n, input.period)) periodDates.add(n.path);
	for (const neg of rules.filter(c => NEGATION.test(c.quote))) {
		const negTokens = new Set(tokenize(neg.quote).filter(t => !NEGATION.test(t)));
		if (negTokens.size < 3) continue;
		for (const other of input.claims) {
			if (other.id === neg.id || other.ref === neg.ref || NEGATION.test(other.quote)) continue;
			if (other.kind !== "plan" && other.kind !== "rule" && other.kind !== "opinion") continue;
			if (!periodDates.has(other.ref) && !periodDates.has(neg.ref)) continue; // at least one side is from this week
			const shared = tokenize(other.quote).filter(t => negTokens.has(t));
			if (new Set(shared).size < 3) continue;
			const a = quoteEvidence(neg, notesByPath);
			const b = quoteEvidence(other, notesByPath);
			if (a && b) return { topic: "claims", rule: a, against: b };
		}
	}

	// 2. a focus rule vs how many different folders this week's notes touched
	const periodNotes = notes.filter(n => inPeriod(n, input.period) && n.kind !== "template" && n.kind !== "empty");
	const focusRule = rules.find(c => FOCUS_RULE.test(c.quote));
	if (focusRule) {
		const rule = quoteEvidence(focusRule, notesByPath);
		const byFolder = new Map<string, ClassifiedNote[]>();
		for (const n of periodNotes) byFolder.set(folderOf(n.path), [...(byFolder.get(folderOf(n.path)) ?? []), n]);
		if (rule && byFolder.size >= 4) {
			const sample = [...byFolder.values()].slice(0, 3).map(g => linkOf(g[0] as ClassifiedNote));
			return { topic: "focus", rule, against: { type: "count", label: "folders", value: byFolder.size, estimate: false, notes: sample } };
		}
	}

	// 3. a capture rule vs a pile of saved material
	const captureRule = rules.find(c => CAPTURE_RULE.test(c.quote));
	if (captureRule) {
		const rule = quoteEvidence(captureRule, notesByPath);
		const saved = periodNotes.filter(n => isSaved(n.kind));
		if (rule && saved.length >= 5 && saved.length >= 3 * Math.max(1, ownPeriodCount)) {
			return { topic: "capture", rule, against: { type: "count", label: "saved", value: saved.length, estimate: false, notes: saved.slice(0, 3).map(linkOf) } };
		}
	}
	return undefined;
}

/** A contradiction is kept only with two pieces of evidence that really exist: a verified quote plus a second verified quote or a measured count. */
export function isValidContradiction(c: ContradictionInsight, notes: ClassifiedNote[]): boolean {
	const byPath = new Map(notes.map(n => [n.path, n]));
	const quoteOk = (e: Extract<Evidence, { type: "quote" }>): boolean => {
		const n = byPath.get(e.note.path);
		return n !== undefined && containsQuote(n.body, e.quote);
	};
	if (!quoteOk(c.rule)) return false;
	if (c.against.type === "quote") return quoteOk(c.against) && c.against.note.path !== c.rule.note.path;
	return c.against.value > 0 && c.against.notes.length > 0 && c.against.notes.every(l => byPath.has(l.path));
}

// ---------------- analysis ----------------

export function analyze(input: AnalysisInput): Analysis {
	const notes = input.notes;
	const periodNotes = notes.filter(n => inPeriod(n, input.period) && n.kind !== "template" && n.kind !== "empty");
	const ownAll = notes.filter(n => n.kind === "own");
	const ownPeriod = ownAll.filter(n => inPeriod(n, input.period));
	const savedPeriod = periodNotes.filter(n => isSaved(n.kind));
	const pdfStubs = savedPeriod.filter(n => n.kind === "pdf-stub").length;
	const short = ownPeriod.length < input.minOwnForFull;

	const analysis: Analysis = {
		week: input.week,
		period: { firstDay: input.period.firstDay, lastDay: input.period.lastDay },
		short,
		directionWeeks: input.directionWeeks,
		stats: { changed: periodNotes.length, own: ownPeriod.length, saved: savedPeriod.length, pdfStubs, themes: input.themes.length },
		question: { variant: "generic" },
	};

	if (short) {
		// Short version: one old thread + one reading + one question
		const overdue = findThreads(input, ownAll, ownPeriod)?.overdue[0];
		const recentOld = [...ownAll].filter(n => !inPeriod(n, input.period)).sort((a, b) => b.modified - a.modified)[0];
		if (overdue) analysis.shortThread = { note: overdue.note, why: "overdue" };
		else if (recentOld) analysis.shortThread = { note: linkOf(recentOld), why: "recent" };
		const readable = notes.filter(n => (n.kind === "clipping" || n.kind === "book") && n.body.trim().length > 200).sort((a, b) => b.modified - a.modified)[0];
		if (readable) analysis.hoarding = { saved: savedPeriod.length, own: ownPeriod.length, pdfStubs: [], reading: { note: linkOf(readable), theme: "" } };
		return analysis;
	}

	analysis.cross = findCross(input, ownAll);
	analysis.threads = findThreads(input, ownAll, ownPeriod);
	analysis.hoarding = findHoarding(input, notes, ownPeriod.length);
	const contradiction = findContradiction(input, notes, ownPeriod.length);
	if (contradiction && isValidContradiction(contradiction, notes)) analysis.contradiction = contradiction;

	if (analysis.contradiction) analysis.question = { variant: "rule", rule: analysis.contradiction.rule.quote };
	else if (analysis.cross && !analysis.cross.hasMature && analysis.cross.weeks >= input.directionWeeks) {
		analysis.question = { variant: "direction", theme: analysis.cross.theme };
	} else if (analysis.cross) analysis.question = { variant: "theme", theme: analysis.cross.theme };
	return analysis;
}
