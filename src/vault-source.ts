import { normalizePath, type App, type TFile } from "obsidian";
import type { NoteRecord } from "@mind-letter/core";
import type { FilePort } from "./memory-store";

/** Longest body kept per note (older notes are shorter: they only need to be recognised, not quoted). */
const BODY_RECENT = 12000;
const BODY_OLD = 2500;
const RECENT_MS = 14 * 24 * 3600 * 1000;

function stripFrontmatter(text: string, end: number | undefined): string {
	if (end !== undefined && end > 0) return text.slice(end).replace(/^\s+/, "");
	return text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
}

function flat(value: unknown): string {
	if (Array.isArray(value)) return value.map(v => (typeof v === "string" || typeof v === "number" ? String(v) : "")).filter(Boolean).join(", ");
	return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? String(value) : "";
}

/** Read every Markdown note of the active vault through the Obsidian API (links, tags and frontmatter come from its cache). */
export async function readVaultNotes(app: App, now: number): Promise<NoteRecord[]> {
	const out: NoteRecord[] = [];
	for (const file of app.vault.getMarkdownFiles()) {
		const cache = app.metadataCache.getFileCache(file);
		let text = "";
		try {
			text = await app.vault.cachedRead(file);
		} catch {
			continue;
		}
		const cap = now - file.stat.mtime < RECENT_MS ? BODY_RECENT : BODY_OLD;
		const fm: Record<string, string> = {};
		for (const [k, v] of Object.entries(cache?.frontmatter ?? {})) {
			if (k === "position") continue;
			const s = flat(v);
			if (s) fm[k] = s;
		}
		const tags = new Set<string>();
		for (const t of cache?.tags ?? []) tags.add(t.tag.replace(/^#/, ""));
		const links = (cache?.links ?? []).map(l => l.link.split("#")[0] ?? "").filter(Boolean);
		out.push(noteFrom(file, stripFrontmatter(text, cache?.frontmatterPosition?.end.offset).slice(0, cap), links, [...tags], fm));
	}
	return out;
}

function noteFrom(file: TFile, body: string, links: string[], tags: string[], frontmatter: Record<string, string>): NoteRecord {
	return {
		id: file.path,
		source: "obsidian",
		title: file.basename,
		path: file.path,
		created: file.stat.ctime,
		modified: file.stat.mtime,
		sizeBytes: file.stat.size,
		body,
		links,
		tags,
		frontmatter,
	};
}

/** File port over the vault adapter: it also reaches the hidden `.memory` folder, which the vault index does not list. */
export function adapterPort(app: App): FilePort {
	const a = app.vault.adapter;
	return {
		exists: p => a.exists(normalizePath(p)),
		read: async p => {
			const path = normalizePath(p);
			return (await a.exists(path)) ? a.read(path) : null;
		},
		write: (p, text) => a.write(normalizePath(p), text),
		ensureFolder: async p => {
			const path = normalizePath(p);
			if (!(await a.exists(path))) await a.mkdir(path);
		},
		listFiles: async p => {
			const path = normalizePath(p);
			if (!(await a.exists(path))) return [];
			const listed = await a.list(path);
			return listed.files.map(f => f.slice(f.lastIndexOf("/") + 1));
		},
	};
}
