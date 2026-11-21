import type { Claim, ClaimKind, ClassifiedNote } from "./types";
import { sentences } from "./text";
import { formatDay } from "./week";

export const MAX_QUOTE_CHARS = 200;
export const MAX_CLAIMS_PER_NOTE = 6;
export const MAX_BANK_SIZE = 500;

/**
 * Pattern lists (Indonesian + English). The no-AI mode finds claims with these; AI mode may add more.
 * A sentence is checked in this order: question, rule, opinion, plan.
 */
const RULE = [
	/\b(?:satu|1)\s+(?:topik|fokus|hal)\b/i,
	/\b(?:harus|wajib|jangan|sebaiknya|seharusnya|selalu|tidak\s+boleh|dilarang|aturan(?:nya)?)\b/i,
	/\b(?:tampung|parkirkan|parkir)\b/i,
	/\b(?:must|should|never|always|do\s+not|don't|rule|one\s+(?:topic|focus|thing)\s+(?:per|at\s+a))\b/i,
];
const OPINION = [
	/\b(?:menurutku|menurut\s+saya|menurut\s+gue|aku\s+(?:pikir|rasa|yakin|percaya)|saya\s+(?:pikir|rasa|yakin|percaya)|kupikir|kurasa|sepertinya\s+aku)\b/i,
	/\b(?:i\s+think|i\s+believe|i\s+feel\s+that|in\s+my\s+(?:opinion|view)|imo)\b/i,
];
const PLAN = [
	/\b(?:rencana(?:ku|nya)?|aku\s+(?:akan|mau|ingin)|saya\s+(?:akan|mau|ingin)|langkah\s+(?:selanjutnya|berikutnya)|target(?:ku)?)\b/i,
	/\b(?:i\s+(?:will|plan\s+to|want\s+to|am\s+going\s+to)|next\s+step|my\s+plan|todo)\b/i,
];

const matches = (patterns: RegExp[], text: string): boolean => patterns.some(p => p.test(text));

export function claimKind(sentence: string): ClaimKind | null {
	const words = sentence.split(/\s+/).length;
	if (sentence.endsWith("?") && words >= 6) return "question";
	if (matches(RULE, sentence)) return "rule";
	if (matches(OPINION, sentence)) return "opinion";
	if (matches(PLAN, sentence)) return "plan";
	return null;
}

export interface RawClaim {
	quote: string;
	kind: ClaimKind;
}

/** Claims of one note, each an EXACT sentence of the note (so it can be verified later). */
export function extractRawClaims(body: string): RawClaim[] {
	const out: RawClaim[] = [];
	const seen = new Set<string>();
	for (const s of sentences(body)) {
		if (s.length > MAX_QUOTE_CHARS) continue;
		const kind = claimKind(s);
		if (!kind || seen.has(s)) continue;
		seen.add(s);
		out.push({ quote: s, kind });
		if (out.length >= MAX_CLAIMS_PER_NOTE) break;
	}
	return out;
}

/** Strongest claims first: rules, then plans, opinions, questions. */
const KIND_ORDER: Record<ClaimKind, number> = { rule: 0, plan: 1, opinion: 2, question: 3 };

export function extractClaims(note: ClassifiedNote, theme: string, startId: number): Claim[] {
	if (note.kind !== "own") return [];
	const raw = extractRawClaims(note.body).sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
	return raw.map((r, i) => ({
		id: `K${startId + i}`,
		source: note.source,
		ref: note.path,
		quote: r.quote,
		theme,
		date: formatDay(note.modified),
		kind: r.kind,
	}));
}

/**
 * Add new claims to the bank: skip duplicates (same note and quote), give fresh ids, keep the newest MAX_BANK_SIZE.
 * Returns the new bank and the ids that were actually added.
 */
export function mergeClaims(bank: Claim[], fresh: Claim[]): { claims: Claim[]; added: Claim[] } {
	const known = new Set(bank.map(c => `${c.ref}\u0000${c.quote}`));
	let next = nextClaimId(bank);
	const added: Claim[] = [];
	for (const c of fresh) {
		const key = `${c.ref}\u0000${c.quote}`;
		if (known.has(key)) continue;
		known.add(key);
		added.push({ ...c, id: `K${next++}` });
	}
	let claims = [...bank, ...added];
	if (claims.length > MAX_BANK_SIZE) claims = claims.slice(claims.length - MAX_BANK_SIZE);
	return { claims, added };
}

export function nextClaimId(bank: Claim[]): number {
	let max = 0;
	for (const c of bank) {
		const n = Number(c.id.replace(/^K/, ""));
		if (Number.isFinite(n) && n > max) max = n;
	}
	return max + 1;
}
