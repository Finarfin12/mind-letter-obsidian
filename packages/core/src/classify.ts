import type { ClassifiedNote, NoteKind, NoteRecord } from "./types";
import { plainText, wordCount } from "./text";

/** Folder names (any depth) that hold saved material rather than the user's own writing. */
const CLIPPING_FOLDERS = ["clippings", "clipping", "web clips", "readwise", "highlights", "saved"];
const BOOK_FOLDERS = ["filsafat", "philosophy", "books", "buku", "library", "perpustakaan", "ebooks"];
const TEMPLATE_FOLDERS = ["templates", "template", "templater"];

/** Files above this size are treated as books/long saved texts, not as a person's own note. */
export const BOOK_SIZE_BYTES = 200 * 1024;

function segments(path: string): string[] {
	return path.toLowerCase().split(/[\\/]/).slice(0, -1);
}

function hasFolder(path: string, names: string[]): boolean {
	return segments(path).some(s => names.includes(s));
}

/** Frontmatter keys web clippers and read-it-later tools leave behind. */
function looksClipped(fm: Record<string, string> | undefined): boolean {
	if (!fm) return false;
	if (fm["type"] && /^(clipping|clip|article|highlight|bookmark|web)$/i.test(fm["type"])) return true;
	return Boolean(fm["source"] && /^https?:\/\//i.test(fm["source"])) || Boolean(fm["url"] && /^https?:\/\//i.test(fm["url"]));
}

/** A body that is only embeds/links (an embedded PDF, a bare link) has no sentence of the user's own. */
function isPdfStub(body: string): boolean {
	const hasPdf = /!?\[\[[^\]]*\.pdf[^\]]*\]\]/i.test(body) || /\]\([^)]*\.pdf\)/i.test(body);
	if (!hasPdf) return false;
	return wordCount(plainText(body).replace(/\.pdf/gi, " ")) < 8;
}

/**
 * Decide what a note is. Order matters: empty and templates first, then size and folders, then the shape of the body.
 * Only `own` notes feed claims and insights; everything else is counted as saved material.
 */
export function classify(note: NoteRecord): NoteKind {
	if (note.sizeBytes === 0 || note.body.trim() === "") return "empty";
	if (hasFolder(note.path, TEMPLATE_FOLDERS)) return "template";
	if (note.frontmatter && /^template$/i.test(note.frontmatter["type"] ?? "")) return "template";
	if (isPdfStub(note.body)) return "pdf-stub";
	if (note.sizeBytes > BOOK_SIZE_BYTES || hasFolder(note.path, BOOK_FOLDERS)) return "book";
	if (hasFolder(note.path, CLIPPING_FOLDERS) || looksClipped(note.frontmatter)) return "clipping";
	// Frontmatter only (no prose at all) is as good as empty
	if (wordCount(plainText(note.body)) === 0) return "empty";
	return "own";
}

export function classifyAll(notes: NoteRecord[]): ClassifiedNote[] {
	return notes.map(n => ({ ...n, kind: classify(n) }));
}

/** Kinds that count as saved material for the hoarding section. */
export function isSaved(kind: NoteKind): boolean {
	return kind === "clipping" || kind === "book" || kind === "pdf-stub";
}

/**
 * Drop notes in excluded folders. A prefix matches whole path segments, case-insensitively
 * ("Journal" excludes "Journal/2026/x.md" but not "Journalism/x.md").
 */
export function excludeFolders<T extends { path: string }>(notes: T[], excluded: string[]): T[] {
	const prefixes = excluded.map(e => e.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "").toLowerCase()).filter(e => e !== "");
	if (prefixes.length === 0) return notes;
	return notes.filter(n => {
		const path = n.path.replace(/\\/g, "/").toLowerCase();
		return !prefixes.some(p => path === p || path.startsWith(p + "/"));
	});
}
