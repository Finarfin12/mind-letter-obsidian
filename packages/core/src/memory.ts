import type { Claim, ClaimKind, FeedbackItem, MemoryState, NoteSource, ThemeEntry, ThemeStatus, ThemeWeek } from "./types";
import { POINT_KINDS } from "./types";

export const emptyMemory = (): MemoryState => ({ claims: [], themes: [], feedback: [] });

const SOURCES: NoteSource[] = ["obsidian", "notion", "arsipkreatif", "other"];
const CLAIM_KINDS: ClaimKind[] = ["rule", "opinion", "plan", "question"];
const STATUSES: ThemeStatus[] = ["new", "recurring", "done"];

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function parseArray(json: string): unknown[] {
	try {
		const v: unknown = JSON.parse(json);
		return Array.isArray(v) ? v : [];
	} catch {
		return [];
	}
}

/** Read claims.json. Anything that does not match the shared format is skipped, never fatal. */
export function parseClaims(json: string): Claim[] {
	const out: Claim[] = [];
	for (const raw of parseArray(json)) {
		if (!isRecord(raw)) continue;
		const { id, source, ref, quote, theme, date, kind } = raw;
		if (typeof id !== "string" || typeof ref !== "string" || typeof quote !== "string" || typeof date !== "string") continue;
		if (!SOURCES.includes(source as NoteSource) || !CLAIM_KINDS.includes(kind as ClaimKind)) continue;
		if (quote.length === 0 || quote.length > 200) continue;
		out.push({ id, source: source as NoteSource, ref, quote, theme: typeof theme === "string" ? theme : "", date, kind: kind as ClaimKind });
	}
	return out;
}

export function parseThemes(json: string): ThemeWeek[] {
	const out: ThemeWeek[] = [];
	for (const raw of parseArray(json)) {
		if (!isRecord(raw) || typeof raw["week"] !== "string" || !/^\d{4}-W\d{2}$/.test(raw["week"]) || !Array.isArray(raw["themes"])) continue;
		const themes: ThemeEntry[] = [];
		for (const t of raw["themes"] as unknown[]) {
			if (!isRecord(t) || typeof t["name"] !== "string" || typeof t["weight"] !== "number") continue;
			if (!STATUSES.includes(t["status"] as ThemeStatus)) continue;
			const claimIds = Array.isArray(t["claimIds"]) ? (t["claimIds"] as unknown[]).filter((x): x is string => typeof x === "string") : [];
			themes.push({ name: t["name"], weight: Math.min(1, Math.max(0, t["weight"])), status: t["status"] as ThemeStatus, claimIds });
		}
		out.push({ week: raw["week"], themes });
	}
	return out;
}

export function parseFeedback(json: string): FeedbackItem[] {
	const out: FeedbackItem[] = [];
	for (const raw of parseArray(json)) {
		if (!isRecord(raw)) continue;
		const { week, item, useful, note } = raw;
		if (typeof week !== "string" || typeof item !== "number" || typeof useful !== "boolean") continue;
		if (!Number.isInteger(item) || item < 1 || item > POINT_KINDS.length) continue;
		out.push(typeof note === "string" ? { week, item, useful, note } : { week, item, useful });
	}
	return out;
}

export const serialize = (value: unknown): string => JSON.stringify(value, null, 2) + "\n";

/**
 * Feedback written in a letter's checklist. Lines look like `- [x] 2 Pertentangan <!--contradiction-->`.
 * A checked box = useful. Unchecked boxes count as "not useful" only when at least one box was checked, so a letter
 * that was never rated produces no feedback at all.
 */
export function parseFeedbackFromLetter(markdown: string): FeedbackItem[] {
	const week = /^week:\s*(\d{4}-W\d{2})\s*$/m.exec(markdown)?.[1];
	if (!week) return [];
	const marker = /^##\s+(?:Umpan balik|Feedback)\b.*$/m.exec(markdown);
	if (!marker) return [];
	const tail = markdown.slice(marker.index + marker[0].length);
	const items: FeedbackItem[] = [];
	for (const line of tail.split(/\r?\n/)) {
		const m = /^\s*-\s+\[([ xX])\]\s+(\d+)\b.*?(?:<!--\s*([a-z]+)\s*-->)?\s*$/.exec(line);
		if (!m) continue;
		const kindIdx = m[3] ? POINT_KINDS.indexOf(m[3] as (typeof POINT_KINDS)[number]) : -1;
		const item = kindIdx >= 0 ? kindIdx + 1 : Number(m[2]);
		if (item < 1 || item > POINT_KINDS.length) continue;
		items.push({ week, item, useful: m[1] !== " " });
	}
	if (!items.some(i => i.useful)) return [];
	return items;
}

/** Replace feedback of the same week and item; keep the last 200 entries. */
export function mergeFeedback(existing: FeedbackItem[], fresh: FeedbackItem[]): FeedbackItem[] {
	const key = (f: FeedbackItem) => `${f.week}#${f.item}`;
	const replaced = new Set(fresh.map(key));
	return [...existing.filter(f => !replaced.has(key(f))), ...fresh].slice(-200);
}
