/**
 * Data shapes shared by every Mind Letter surface (Obsidian plugin, local newsletter app, skill).
 * The JSON formats of Claim / ThemeWeek / FeedbackItem are the "shared data format" of the architecture (section 3).
 */

export type Lang = "id" | "en";

export type NoteSource = "obsidian" | "notion" | "arsipkreatif" | "other";

/** own = the user's own writing; the rest is saved material or noise. */
export type NoteKind = "own" | "clipping" | "book" | "pdf-stub" | "template" | "empty";

export interface NoteRecord {
	id: string;
	source: NoteSource;
	title: string;
	/** Path inside the source (vault path, page URL, ...). Used for links. */
	path: string;
	/** Epoch milliseconds. */
	created: number;
	modified: number;
	sizeBytes: number;
	/** Note text WITHOUT frontmatter, possibly truncated by the reader. */
	body: string;
	/** Link targets as written (`[[Target]]` -> "Target"). */
	links: string[];
	tags: string[];
	/** Frontmatter as flat strings (arrays are joined with ", "). */
	frontmatter?: Record<string, string>;
}

export interface ClassifiedNote extends NoteRecord {
	kind: NoteKind;
}

export type ClaimKind = "rule" | "opinion" | "plan" | "question";

export interface Claim {
	id: string;
	source: NoteSource;
	/** Path or URL of the note the quote comes from. */
	ref: string;
	/** Exact text from the note, at most 200 characters. */
	quote: string;
	theme: string;
	/** YYYY-MM-DD */
	date: string;
	kind: ClaimKind;
}

export type ThemeStatus = "new" | "recurring" | "done";

export interface ThemeEntry {
	name: string;
	/** Share of this week's own notes about the theme, 0..1. */
	weight: number;
	status: ThemeStatus;
	claimIds: string[];
}

export interface ThemeWeek {
	/** YYYY-Www */
	week: string;
	themes: ThemeEntry[];
}

export interface FeedbackItem {
	week: string;
	/** 1..5, see POINT_KINDS. */
	item: number;
	useful: boolean;
	note?: string;
}

export type PointKind = "cross" | "contradiction" | "threads" | "hoarding" | "question";

/** Item numbers used in the letter and in feedback. Stable across weeks and languages. */
export const POINT_KINDS: readonly PointKind[] = ["cross", "contradiction", "threads", "hoarding", "question"];

export interface NoteLink {
	title: string;
	path: string;
}

/** One piece of evidence behind a point. A quote must be an exact substring of the note it names. */
export type Evidence =
	| { type: "quote"; quote: string; note: NoteLink }
	| { type: "count"; label: string; value: number; estimate: boolean; notes: NoteLink[] };

export interface MemoryState {
	claims: Claim[];
	themes: ThemeWeek[];
	feedback: FeedbackItem[];
}

export interface LetterSettings {
	lang: Lang;
	/** Folders (vault-relative prefixes) whose notes are never read. */
	excludedFolders: string[];
	/** Minimum own notes for the full letter (default 3). */
	minOwnForFull: number;
	/** Weeks a theme must keep coming back to count as "direction" (default 3). */
	directionWeeks: number;
}

export const DEFAULT_LETTER_SETTINGS: LetterSettings = {
	lang: "id",
	excludedFolders: [],
	minOwnForFull: 3,
	directionWeeks: 3,
};
