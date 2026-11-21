import type { Analysis, ThreadsInsight } from "./insights";
import type { FeedbackItem, Lang, NoteLink, PointKind } from "./types";
import { POINT_KINDS } from "./types";
import { monthName } from "./text";
import { weekNumber } from "./week";

/**
 * One section of the letter. `facts` is everything the section is allowed to say: the AI layer may reword the body
 * but every link and quote it uses must come from here (see refine.ts).
 */
export interface LetterPoint {
	kind: PointKind;
	/** Sequential number in this letter (1..n). */
	number: number;
	heading: string;
	/** Markdown body, no heading. */
	body: string;
	facts: { links: NoteLink[]; quotes: string[] };
}

export interface LetterMeta {
	week: string;
	firstDay: string;
	lastDay: string;
	/** Free text for the frontmatter, e.g. "Mind Letter 0.1.0 (basic mode)". */
	generatedBy: string;
	sources: string[];
}

const wiki = (l: NoteLink): string => {
	const target = l.path.replace(/\.md$/i, "");
	const label = l.title.replace(/[[\]|]/g, " ").trim();
	return label !== "" && label !== target.split("/").pop() ? `[[${target}|${label}]]` : `[[${target}]]`;
};

const list = (links: NoteLink[]): string => links.map(wiki).join(", ");

const clip = (s: string, n: number): string => (s.length <= n ? s : s.slice(0, n - 1).trimEnd() + "…");

interface Strings {
	title: (week: number, range: string) => string;
	titleShort: (week: number, range: string) => string;
	headings: Record<PointKind, string>;
	shortHeadings: { threads: string; hoarding: string; question: string };
	cross: {
		head: (theme: string) => string;
		headDirection: (theme: string, weeks: number) => string;
		body: (theme: string, n: number, notes: string, folders: string[]) => string;
		streak: (weeks: number) => string;
		noMature: string;
		old: (notes: string) => string;
	};
	contradiction: {
		wrote: string;
		quote: (q: string, note: string) => string;
		focus: (n: number, notes: string) => string;
		capture: (saved: number, notes: string) => string;
		claims: string;
		close: string;
	};
	threads: {
		duplicateTitle: (a: string, b: string) => string;
		duplicateContent: (a: string, b: string) => string;
		unlinked: (a: string, b: string, shared: string) => string;
		overdue: (note: string, due: string) => string;
	};
	hoarding: {
		ratio: (saved: number, own: number) => string;
		stubs: (n: number, notes: string) => string;
		reading: (note: string, theme: string) => string;
		readingNoTheme: (note: string) => string;
	};
	shortThread: { overdue: (note: string) => string; recent: (note: string) => string; none: string };
	questions: {
		rule: (rule: string) => string;
		direction: (theme: string, weeks: number) => string;
		theme: (theme: string) => string;
		generic: string;
	};
	stats: (s: Analysis["stats"]) => string;
	feedbackTitle: string;
	feedbackHint: string;
}

const ID: Strings = {
	title: (w, r) => `# Surat Otak — Minggu ${w} (${r})`,
	titleShort: (w, r) => `# Surat Otak singkat — Minggu ${w} (${r})`,
	headings: {
		cross: "Lintas catatan",
		contradiction: "Pertentangan",
		threads: "Benang terputus",
		hoarding: "Penimbunan",
		question: "Satu pertanyaan untuk minggu depan",
	},
	shortHeadings: { threads: "Satu benang lama", hoarding: "Satu bacaan", question: "Satu pertanyaan" },
	cross: {
		head: t => `Lintas catatan: ${t} mendominasi minggu ini`,
		headDirection: (t, w) => `Arah: ${w} minggu berputar di ${t}`,
		body: (t, n, notes, folders) =>
			`Topik **${t}** muncul di **${n} catatanmu** minggu ini: ${notes}.` + (folders.length > 1 ? ` Tersebar di ${folders.length} folder (${folders.join(", ")}).` : ""),
		streak: w => `Ini minggu ke-${w} berturut-turut topik ini muncul.`,
		noMature: "Belum ada tulisan matang (terbit/selesai) tentang topik ini — pikirannya sudah ada, tulisannya belum.",
		old: notes => `Catatan lama yang dekat dengan topik ini: ${notes}.`,
	},
	contradiction: {
		wrote: "Di catatanmu kamu menulis:",
		quote: (q, note) => `> "${q}" — ${note}`,
		focus: (n, notes) => `Di minggu yang sama, catatanmu menyentuh **${n} folder berbeda** (contoh: ${notes}).`,
		capture: (s, notes) => `Di minggu yang sama, kamu menyimpan **${s} bahan** (contoh: ${notes}).`,
		claims: "Di catatan lain kamu menulis hal yang berlawanan:",
		close: "Ini bukan teguran: dua sisi ini sama-sama tulisanmu. Mana yang masih kamu pegang?",
	},
	threads: {
		duplicateTitle: (a, b) => `Dua catatan berjudul sama: ${a} dan ${b}.`,
		duplicateContent: (a, b) => `Isi ${a} dan ${b} hampir sama; mungkin salah satu bisa digabung.`,
		unlinked: (a, b, s) => `${a} dan ${b} membahas hal yang sama (${s}) tetapi belum bertaut.`,
		overdue: (n, d) => `${n} sudah lewat jadwal review (${d}).`,
	},
	hoarding: {
		ratio: (s, o) => `Minggu ini **${s} bahan disimpan** vs **${o} tulisan sendiri** (klasifikasi otomatis, angka perkiraan).`,
		stubs: (n, notes) => `${n} catatan hanya berisi embed PDF tanpa satu kalimat darimu: ${notes}.`,
		reading: (note, theme) => `**Saran satu bacaan:** ${note} — paling dekat dengan topik **${theme}** minggu ini.`,
		readingNoTheme: note => `**Saran satu bacaan:** ${note} — simpananmu yang paling baru dan masih punya teks.`,
	},
	shortThread: {
		overdue: n => `${n} sudah lewat jadwal review — layak dibuka lagi.`,
		recent: n => `Catatan terakhir yang kamu tulis sebelum minggu ini: ${n}. Layak dibuka lagi?`,
		none: "Belum ada catatan lama yang bisa dipilih.",
	},
	questions: {
		rule: r => `Aturan “${clip(r, 120)}” itu masih kamu pegang untuk minggu depan, atau perlu ditulis ulang?`,
		direction: (t, w) => `Topik ${t} sudah ${w} minggu berputar: tulisan matang apa — sekecil apa pun — yang bisa kamu selesaikan minggu depan?`,
		theme: t => `Dari semua yang kamu tulis tentang ${t} minggu ini, satu kalimat apa yang paling kamu yakini — dan apa yang bisa membuktikannya salah?`,
		generic: "Dari catatan minggu ini, mana satu yang paling ingin kamu kembangkan, dan langkah kecil pertama apa yang bisa kamu ambil?",
	},
	stats: s =>
		`Statistik: ${s.changed} catatan berubah (${s.own} tulisan sendiri, ${s.saved} simpanan, ${s.pdfStubs} stub PDF) · ${s.themes} tema · klasifikasi otomatis, angka perkiraan.`,
	feedbackTitle: "Umpan balik",
	feedbackHint: "centang = berguna; kosongkan yang tidak berguna",
};

const EN: Strings = {
	title: (w, r) => `# Mind Letter — Week ${w} (${r})`,
	titleShort: (w, r) => `# Mind Letter, short version — Week ${w} (${r})`,
	headings: {
		cross: "Across your notes",
		contradiction: "Contradiction",
		threads: "Loose threads",
		hoarding: "Hoarding",
		question: "One question for next week",
	},
	shortHeadings: { threads: "One old thread", hoarding: "One reading", question: "One question" },
	cross: {
		head: t => `Across your notes: ${t} dominates this week`,
		headDirection: (t, w) => `Direction: ${w} weeks circling ${t}`,
		body: (t, n, notes, folders) =>
			`The topic **${t}** shows up in **${n} of your notes** this week: ${notes}.` + (folders.length > 1 ? ` It is spread over ${folders.length} folders (${folders.join(", ")}).` : ""),
		streak: w => `This is the ${w}th week in a row this topic appears.`,
		noMature: "There is no finished piece (published/done) on this topic yet: the thinking is there, the writing is not.",
		old: notes => `Older notes close to this topic: ${notes}.`,
	},
	contradiction: {
		wrote: "In your notes you wrote:",
		quote: (q, note) => `> "${q}" — ${note}`,
		focus: (n, notes) => `The same week, your notes touched **${n} different folders** (for example: ${notes}).`,
		capture: (s, notes) => `The same week, you saved **${s} items** (for example: ${notes}).`,
		claims: "In another note you wrote the opposite:",
		close: "This is not a reprimand: both sides are your own words. Which one do you still hold?",
	},
	threads: {
		duplicateTitle: (a, b) => `Two notes with the same title: ${a} and ${b}.`,
		duplicateContent: (a, b) => `${a} and ${b} say almost the same thing; maybe merge them.`,
		unlinked: (a, b, s) => `${a} and ${b} are about the same thing (${s}) but are not linked.`,
		overdue: (n, d) => `${n} is past its review date (${d}).`,
	},
	hoarding: {
		ratio: (s, o) => `This week **${s} items saved** vs **${o} pieces of your own writing** (automatic classification, estimates).`,
		stubs: (n, notes) => `${n} notes are only an embedded PDF without a sentence of yours: ${notes}.`,
		reading: (note, theme) => `**One reading suggested:** ${note} — closest to this week's topic **${theme}**.`,
		readingNoTheme: note => `**One reading suggested:** ${note} — your newest saved text.`,
	},
	shortThread: {
		overdue: n => `${n} is past its review date — worth reopening.`,
		recent: n => `The last note you wrote before this week: ${n}. Worth reopening?`,
		none: "No older note to pick yet.",
	},
	questions: {
		rule: r => `Do you still hold the rule “${clip(r, 120)}” for next week, or does it need rewriting?`,
		direction: (t, w) => `${t} has been circling for ${w} weeks: what finished piece, however small, can you complete next week?`,
		theme: t => `Of everything you wrote about ${t} this week, which one sentence do you believe most — and what would prove it wrong?`,
		generic: "Of this week's notes, which one do you most want to develop, and what is the first small step?",
	},
	stats: s =>
		`Stats: ${s.changed} notes changed (${s.own} own writing, ${s.saved} saved, ${s.pdfStubs} PDF stubs) · ${s.themes} themes · automatic classification, counts are estimates.`,
	feedbackTitle: "Feedback",
	feedbackHint: "checked = useful; leave unchecked what was not useful",
};

export const STRINGS: Record<Lang, Strings> = { id: ID, en: EN };

/** "14–21 Nov 2026" or "28 Nov–5 Des 2026" for the heading. */
export function rangeLabel(firstDay: string, lastDay: string, lang: Lang): string {
	const [fy, fm, fd] = firstDay.split("-").map(Number) as [number, number, number];
	const [ly, lm, ld] = lastDay.split("-").map(Number) as [number, number, number];
	const m1 = monthName(fm - 1, lang);
	const m2 = monthName(lm - 1, lang);
	if (fy === ly && fm === lm) return `${fd}–${ld} ${m2} ${ly}`;
	if (fy === ly) return `${fd} ${m1}–${ld} ${m2} ${ly}`;
	return `${fd} ${m1} ${fy}–${ld} ${m2} ${ly}`;
}

function threadsBody(t: ThreadsInsight, s: Strings): { body: string; links: NoteLink[] } {
	const lines: string[] = [];
	const links: NoteLink[] = [];
	for (const d of t.duplicates) {
		lines.push("- " + (d.reason === "title" ? s.threads.duplicateTitle(wiki(d.a), wiki(d.b)) : s.threads.duplicateContent(wiki(d.a), wiki(d.b))));
		links.push(d.a, d.b);
	}
	for (const u of t.unlinked) {
		lines.push("- " + s.threads.unlinked(wiki(u.a), wiki(u.b), u.shared.join(", ")));
		links.push(u.a, u.b);
	}
	for (const o of t.overdue) {
		lines.push("- " + s.threads.overdue(wiki(o.note), o.due));
		links.push(o.note);
	}
	return { body: lines.join("\n"), links };
}

export function questionText(a: Analysis, lang: Lang, weeks?: number): string {
	const q = STRINGS[lang].questions;
	switch (a.question.variant) {
		case "rule":
			return q.rule(a.question.rule ?? "");
		case "direction":
			return q.direction(a.question.theme ?? "", weeks ?? a.cross?.weeks ?? 3);
		case "theme":
			return q.theme(a.question.theme ?? "");
		default:
			return q.generic;
	}
}

/**
 * Turn an analysis into the sections of the letter. `skip` holds kinds the person marked "not useful" twice in a row
 * (see suppressedKinds): they are left out, but the closing question is never skipped.
 */
export function buildPoints(a: Analysis, lang: Lang, skip: ReadonlySet<PointKind> = new Set()): LetterPoint[] {
	const s = STRINGS[lang];
	const points: LetterPoint[] = [];
	const add = (kind: PointKind, heading: string, body: string, links: NoteLink[], quotes: string[] = []) => {
		points.push({ kind, number: points.length + 1, heading, body, facts: { links, quotes } });
	};

	if (a.short) {
		if (!skip.has("threads") && a.shortThread) {
			const note = wiki(a.shortThread.note);
			add("threads", s.shortHeadings.threads, a.shortThread.why === "overdue" ? s.shortThread.overdue(note) : s.shortThread.recent(note), [a.shortThread.note]);
		}
		if (!skip.has("hoarding") && a.hoarding?.reading) {
			add("hoarding", s.shortHeadings.hoarding, s.hoarding.readingNoTheme(wiki(a.hoarding.reading.note)), [a.hoarding.reading.note]);
		}
		add("question", s.shortHeadings.question, `**${questionText(a, lang)}**`, []);
		return points;
	}

	if (a.cross && !skip.has("cross")) {
		const c = a.cross;
		const direction = !c.hasMature && c.weeks >= a.directionWeeks;
		const parts = [s.cross.body(c.theme, c.noteCount, list(c.notes), c.folders)];
		if (c.weeks >= 2) parts.push(s.cross.streak(c.weeks));
		if (!c.hasMature) parts.push(s.cross.noMature);
		if (c.oldRelated.length > 0) parts.push(s.cross.old(list(c.oldRelated)));
		add("cross", direction ? s.cross.headDirection(c.theme, c.weeks) : s.cross.head(c.theme), parts.join(" "), [...c.notes, ...c.oldRelated]);
	}

	if (a.contradiction && !skip.has("contradiction")) {
		const c = a.contradiction;
		const lines = [s.contradiction.wrote, s.contradiction.quote(c.rule.quote, wiki(c.rule.note))];
		const links: NoteLink[] = [c.rule.note];
		const quotes = [c.rule.quote];
		if (c.against.type === "quote") {
			lines.push("", s.contradiction.claims, s.contradiction.quote(c.against.quote, wiki(c.against.note)));
			links.push(c.against.note);
			quotes.push(c.against.quote);
		} else {
			lines.push("", c.topic === "focus" ? s.contradiction.focus(c.against.value, list(c.against.notes)) : s.contradiction.capture(c.against.value, list(c.against.notes)));
			links.push(...c.against.notes);
		}
		lines.push("", s.contradiction.close);
		add("contradiction", s.headings.contradiction, lines.join("\n"), links, quotes);
	}

	if (a.threads && !skip.has("threads")) {
		const t = threadsBody(a.threads, s);
		add("threads", s.headings.threads, t.body, t.links);
	}

	if (a.hoarding && !skip.has("hoarding")) {
		const h = a.hoarding;
		const lines = [`- ${s.hoarding.ratio(h.saved, h.own)}`];
		const links: NoteLink[] = [...h.pdfStubs];
		if (h.pdfStubs.length > 0) lines.push(`- ${s.hoarding.stubs(h.pdfStubs.length, list(h.pdfStubs.slice(0, 3)))}`);
		if (h.reading) {
			lines.push(`- ${h.reading.theme ? s.hoarding.reading(wiki(h.reading.note), h.reading.theme) : s.hoarding.readingNoTheme(wiki(h.reading.note))}`);
			links.push(h.reading.note);
		}
		add("hoarding", s.headings.hoarding, lines.join("\n"), links);
	}

	add("question", s.headings.question, `**${questionText(a, lang)}**`, []);
	return points;
}

/** The kind of a point in feedback numbering (1..5), stable across letters. */
export const kindNumber = (kind: PointKind): number => POINT_KINDS.indexOf(kind) + 1;

/**
 * Render the finished letter: frontmatter, title, numbered sections, stats and the feedback checklist.
 * Each feedback line carries a hidden `<!--kind-->` marker so a later letter can tell which kind of point was rated.
 */
export function renderLetter(meta: LetterMeta, points: LetterPoint[], analysis: Analysis, lang: Lang): string {
	const s = STRINGS[lang];
	const range = rangeLabel(meta.firstDay, meta.lastDay, lang);
	const wk = weekNumber(meta.week);
	const out: string[] = [
		"---",
		"type: mind-letter",
		`week: ${meta.week}`,
		`period: ${meta.firstDay} — ${meta.lastDay}`,
		`sources: [${meta.sources.join(", ")}]`,
		`generated-by: ${meta.generatedBy}`,
		"---",
		analysis.short ? s.titleShort(wk, range) : s.title(wk, range),
		"",
	];
	for (const p of points) {
		out.push(`## ${p.number}. ${p.heading}`, p.body, "");
	}
	out.push("---", `<small>${s.stats(analysis.stats)}</small>`, "", `## ${s.feedbackTitle} (${s.feedbackHint})`);
	for (const p of points) out.push(`- [ ] ${p.number} ${p.heading.split(":")[0]} <!--${p.kind}-->`);
	out.push("");
	return out.join("\n");
}

/** Convenience used by the pipeline and tests: analysis -> final Markdown, no AI. */
export function composeLetter(meta: LetterMeta, analysis: Analysis, lang: Lang, skip: ReadonlySet<PointKind> = new Set()): { markdown: string; points: LetterPoint[] } {
	const points = buildPoints(analysis, lang, skip);
	return { markdown: renderLetter(meta, points, analysis, lang), points };
}

/**
 * Kinds that were marked "not useful" in each of the last two rated letters are left out of the next letter.
 * (The question is never left out.) Needs feedback items with their week.
 */
export function suppressedKinds(feedback: FeedbackItem[]): Set<PointKind> {
	const out = new Set<PointKind>();
	for (const kind of POINT_KINDS) {
		if (kind === "question") continue;
		const n = POINT_KINDS.indexOf(kind) + 1;
		const rated = feedback.filter(f => f.item === n).sort((a, b) => (a.week < b.week ? 1 : -1)).slice(0, 2);
		if (rated.length === 2 && rated.every(f => !f.useful)) out.add(kind);
	}
	return out;
}
