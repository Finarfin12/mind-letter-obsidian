import type { Lang } from "./types";

/** Small stop-word lists (Indonesian + English): enough to keep keyword themes meaningful. */
const STOP_ID = [
	"yang", "dan", "di", "ke", "dari", "untuk", "dengan", "pada", "adalah", "ini", "itu", "atau", "juga", "tidak", "bisa", "akan",
	"sudah", "belum", "lebih", "karena", "kalau", "jika", "saat", "dalam", "oleh", "agar", "supaya", "sebagai", "seperti", "hanya",
	"saja", "ada", "kita", "kami", "kamu", "aku", "saya", "dia", "mereka", "nya", "pun", "lah", "kah", "tapi", "tetapi", "namun",
	"maka", "bahwa", "para", "semua", "setiap", "antara", "setelah", "sebelum", "ketika", "yaitu", "yakni", "dapat", "harus", "boleh",
	"banyak", "sangat", "paling", "masih", "lagi", "buat", "bikin", "apa", "siapa", "bagaimana", "mengapa", "kenapa", "mana", "satu",
	"dua", "tiga", "jadi", "membuat", "dibuat", "melakukan", "dilakukan", "sebuah", "suatu", "tentang", "terhadap", "secara", "dll",
];
const STOP_EN = [
	"the", "and", "for", "are", "but", "not", "you", "all", "any", "can", "had", "her", "was", "one", "our", "out", "has", "have",
	"him", "his", "how", "its", "may", "new", "now", "old", "see", "two", "way", "who", "did", "get", "let", "put", "say", "she",
	"too", "use", "that", "with", "this", "from", "they", "will", "would", "there", "their", "what", "about", "which", "when", "make",
	"like", "time", "just", "know", "take", "into", "year", "your", "some", "could", "them", "other", "than", "then", "look", "only",
	"come", "over", "also", "back", "after", "work", "first", "well", "even", "because", "these", "give", "most", "been", "were",
	"being", "does", "doing", "should", "very", "much", "more", "such", "each", "where", "here", "while", "still", "need", "want",
];
export const STOPWORDS: ReadonlySet<string> = new Set([...STOP_ID, ...STOP_EN]);

/** Lower-case words of letters/digits (any script), 4+ characters, no stop words and no pure numbers. */
export function tokenize(text: string): string[] {
	const words = text.toLowerCase().split(/[^\p{L}\p{N}]+/u);
	const out: string[] = [];
	for (const w of words) {
		if (w.length < 4 || STOPWORDS.has(w) || /^\d+$/.test(w)) continue;
		out.push(w);
	}
	return out;
}

/** Term-frequency map. */
export function termFrequency(tokens: string[]): Map<string, number> {
	const tf = new Map<string, number>();
	for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
	return tf;
}

/** Cosine similarity of two term-frequency maps, 0..1. */
export function cosine(a: Map<string, number>, b: Map<string, number>): number {
	if (a.size === 0 || b.size === 0) return 0;
	const [small, large] = a.size <= b.size ? [a, b] : [b, a];
	let dot = 0;
	for (const [term, count] of small) {
		const other = large.get(term);
		if (other !== undefined) dot += count * other;
	}
	if (dot === 0) return 0;
	let na = 0;
	for (const c of a.values()) na += c * c;
	let nb = 0;
	for (const c of b.values()) nb += c * c;
	return dot / Math.sqrt(na * nb);
}

/** Number of distinct terms two token sets share. */
export function sharedTerms(a: Map<string, number>, b: Map<string, number>): string[] {
	const out: string[] = [];
	for (const term of a.keys()) if (b.has(term)) out.push(term);
	return out;
}

/** Strip Markdown noise (embeds, code fences, links) so counting words and sentences works on prose. */
export function plainText(markdown: string): string {
	return markdown
		.replace(/```[\s\S]*?```/g, " ")
		.replace(/!\[\[[^\]]*\]\]/g, " ")
		.replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
		.replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g, (_m, target: string, alias: string | undefined) => alias ?? target)
		.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
		.replace(/<[^>]+>/g, " ")
		.replace(/^\s{0,3}#{1,6}\s+/gm, "");
}

export function wordCount(text: string): number {
	const m = text.match(/[\p{L}\p{N}]+/gu);
	return m ? m.length : 0;
}

/**
 * Split prose into sentences that are exact substrings of the input (trimmed), so a quote can always be verified.
 * Block quotes (lines starting with ">") are skipped: they are other people's words.
 */
export function sentences(markdown: string): string[] {
	const out: string[] = [];
	const lines = markdown.split(/\r?\n/);
	for (const raw of lines) {
		if (/^\s*>/.test(raw)) continue;
		const line = raw.replace(/^\s*(?:[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+)/, "").trim();
		if (line === "" || /^#{1,6}\s/.test(line)) continue;
		const parts = line.split(/(?<=[.!?])\s+/);
		for (const p of parts) {
			const s = p.trim();
			if (s.length >= 12) out.push(s);
		}
	}
	return out;
}

/** True when `quote` appears verbatim (ignoring leading/trailing space) in `body`. */
export function containsQuote(body: string, quote: string): boolean {
	const q = quote.trim();
	return q.length > 0 && body.includes(q);
}

const MONTHS_ID = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function monthName(month0: number, lang: Lang): string {
	return (lang === "id" ? MONTHS_ID : MONTHS_EN)[month0] ?? "";
}

/**
 * Guess the language of a set of texts: Indonesian when its common function words clearly dominate English ones.
 * Used for the "auto" language setting.
 */
export function guessLanguage(texts: string[]): Lang {
	let id = 0;
	let en = 0;
	const idWords = new Set(["yang", "dan", "dengan", "untuk", "tidak", "adalah", "dari", "pada", "karena", "kalau", "saya", "aku", "bisa"]);
	const enWords = new Set(["the", "and", "with", "for", "not", "that", "this", "from", "because", "have", "will", "can"]);
	for (const text of texts) {
		for (const w of text.toLowerCase().split(/[^\p{L}]+/u)) {
			if (idWords.has(w)) id++;
			else if (enWords.has(w)) en++;
		}
	}
	return id >= en ? "id" : "en";
}
