import { describe, expect, it } from "vitest";
import {
	analyze,
	buildPoints,
	classify,
	classifyAll,
	composeLetter,
	containsQuote,
	cosine,
	emptyMemory,
	excludeFolders,
	extractRawClaims,
	findThemes,
	guessLanguage,
	inPeriod,
	isMature,
	isoWeek,
	lastSevenDays,
	mergeClaims,
	parseClaims,
	parseFeedback,
	parseFeedbackFromLetter,
	parseThemes,
	periodWeeksBefore,
	previousWeekLabel,
	runPipeline,
	sentences,
	serialize,
	suppressedKinds,
	termFrequency,
	tokenize,
	warmup,
	DEFAULT_LETTER_SETTINGS,
	type ClassifiedNote,
	type FeedbackItem,
	type LetterSettings,
	type NoteRecord,
} from "@mind-letter/core";
import { daysAgo, note, NOW, quietVault, syntheticVault } from "./fixtures";

const settings: LetterSettings = { ...DEFAULT_LETTER_SETTINGS, lang: "id" };
const run = (notes: NoteRecord[], over: Partial<Parameters<typeof runPipeline>[0]> = {}) =>
	runPipeline({ notes, now: NOW, settings, memory: emptyMemory(), generatedBy: "test", ...over });

describe("weeks and periods", () => {
	it("ISO week labels, including year boundaries", () => {
		expect(isoWeek(NOW)).toBe("2026-W47");
		expect(isoWeek(new Date(2026, 0, 1).getTime())).toBe("2026-W01");
		expect(isoWeek(new Date(2025, 11, 29).getTime())).toBe("2026-W01");
		expect(isoWeek(new Date(2021, 0, 3).getTime())).toBe("2020-W53");
		expect(previousWeekLabel("2026-W47")).toBe("2026-W46");
		expect(previousWeekLabel("2026-W01")).toBe("2025-W52");
		expect(previousWeekLabel("2021-W01")).toBe("2020-W53");
	});

	it("the period is the 7 calendar days ending today", () => {
		const p = lastSevenDays(NOW);
		expect(p.firstDay).toBe("2026-11-15");
		expect(p.lastDay).toBe("2026-11-21");
		expect(p.week).toBe("2026-W47");
		expect(inPeriod(daysAgo(6), p)).toBe(true);
		expect(inPeriod(daysAgo(7), p)).toBe(false);
		expect(periodWeeksBefore(NOW, 1).lastDay).toBe("2026-11-14");
	});
});

describe("C1 classify", () => {
	const kind = (over: Partial<NoteRecord> & { path: string; body: string }) => classify(note(over));
	it("Clippings/ -> clipping; clipper frontmatter -> clipping", () => {
		expect(kind({ path: "Clippings/a.md", body: "isi artikel yang cukup panjang untuk dibaca" })).toBe("clipping");
		expect(kind({ path: "Lain/a.md", body: "isi artikel yang cukup panjang", frontmatter: { source: "https://x.example" } })).toBe("clipping");
	});
	it("Filsafat/ or > 200 KB -> book", () => {
		expect(kind({ path: "Filsafat/Republik.md", body: "teks buku yang panjang sekali" })).toBe("book");
		expect(kind({ path: "Lain/besar.md", body: "teks", sizeBytes: 300 * 1024 })).toBe("book");
	});
	it("only a PDF embed -> pdf-stub; a PDF embed with the user's own sentences stays own", () => {
		expect(kind({ path: "Papers/p.md", body: "![[paper.pdf]]" })).toBe("pdf-stub");
		expect(kind({ path: "Papers/q.md", body: "[Paper](paper.pdf)" })).toBe("pdf-stub");
		expect(kind({ path: "Papers/r.md", body: "![[paper.pdf]]\n\nMenurutku bagian kedua paper ini menjelaskan mengapa kita sering salah menilai pemahaman sendiri." })).toBe("own");
	});
	it("Templates/ -> template; 0 byte or blank -> empty; the rest -> own", () => {
		expect(kind({ path: "Templates/t.md", body: "# {{title}}" })).toBe("template");
		expect(kind({ path: "x.md", body: "", sizeBytes: 0 })).toBe("empty");
		expect(kind({ path: "y.md", body: "   \n\n  " })).toBe("empty");
		expect(kind({ path: "Ide/z.md", body: "Tulisan sendiri tentang sesuatu yang penting bagiku." })).toBe("own");
	});
	it("excluded folders drop whole path segments only, case-insensitively", () => {
		const notes = [note({ path: "Journal/2026/a.md", body: "a" }), note({ path: "Journalism/b.md", body: "b" }), note({ path: "journal.md", body: "c" })];
		expect(excludeFolders(notes, ["journal"]).map(n => n.path)).toEqual(["Journalism/b.md", "journal.md"]);
		expect(excludeFolders(notes, [])).toHaveLength(3);
	});
	it("a full vault classifies as expected", () => {
		const kinds = classifyAll(syntheticVault()).reduce<Record<string, number>>((acc, n) => ({ ...acc, [n.kind]: (acc[n.kind] ?? 0) + 1 }), {});
		expect(kinds).toMatchObject({ own: 8, clipping: 7, book: 6, "pdf-stub": 3, template: 1, empty: 1 });
	});
});

describe("C2 claims (no AI)", () => {
	it("the focus rule and the capture rule are found as exact sentences", () => {
		const body = "Satu topik utama per periode. Parkirkan dulu yang lainnya.\n\nTampung, jangan langsung kejar.\n\nCuaca bagus.";
		const claims = extractRawClaims(body);
		expect(claims.map(c => c.kind)).toEqual(["rule", "rule", "rule"].slice(0, claims.length));
		expect(claims.some(c => c.quote.startsWith("Satu topik utama per periode"))).toBe(true);
		for (const c of claims) expect(containsQuote(body, c.quote)).toBe(true);
	});
	it("opinions, plans and questions are recognised; block quotes (other people's words) are skipped", () => {
		const body = [
			"Menurutku penyaring itu kunci bagi memori kerja kita.",
			"Aku akan menulis esai tentang lupa minggu depan.",
			"Kenapa kita lupa justru saat sedang paling berusaha mengingat?",
			"> Kamu harus selalu membaca setiap buku sampai selesai.",
			"Kalimat biasa tanpa pola apa pun di sini.",
		].join("\n");
		const kinds = Object.fromEntries(extractRawClaims(body).map(c => [c.kind, c.quote]));
		expect(Object.keys(kinds).sort()).toEqual(["opinion", "plan", "question"]);
		expect(extractRawClaims(body).some(c => c.quote.includes("Kamu harus selalu"))).toBe(false);
	});
	it("English patterns work too", () => {
		const kinds = extractRawClaims("I think that sleep matters more than any app. You should never skip review sessions.").map(c => c.kind);
		expect(kinds).toContain("opinion");
		expect(kinds).toContain("rule");
	});
	it("long sentences, at most 6 per note, and duplicates are not claims", () => {
		const long = "Kamu harus " + "sangat ".repeat(60) + "berhati-hati.";
		expect(extractRawClaims(long)).toEqual([]);
		const many = Array.from({ length: 12 }, (_, i) => `Aturan nomor ${i} harus selalu diikuti dengan teliti.`).join("\n");
		expect(extractRawClaims(many)).toHaveLength(6);
		expect(extractRawClaims("Kamu harus tidur cukup.\nKamu harus tidur cukup.")).toHaveLength(1);
	});
	it("mergeClaims gives fresh ids, skips duplicates and keeps the newest 500", () => {
		const fresh = [{ id: "x", source: "obsidian" as const, ref: "a.md", quote: "Kamu harus tidur cukup.", theme: "tidur", date: "2026-11-20", kind: "rule" as const }];
		const first = mergeClaims([], fresh);
		expect(first.added[0]?.id).toBe("K1");
		const again = mergeClaims(first.claims, fresh);
		expect(again.added).toHaveLength(0);
		const big = Array.from({ length: 510 }, (_, i) => ({ ...fresh[0]!, id: `K${i + 1}`, quote: `Kamu harus melakukan hal nomor ${i}.` }));
		expect(mergeClaims([], big).claims).toHaveLength(500);
	});
});

describe("themes", () => {
	const own = (): ClassifiedNote[] => classifyAll(syntheticVault()).filter(n => n.kind === "own" && inPeriod(n.modified, lastSevenDays(NOW)));
	it("finds the memory/forgetting theme and groups its notes", () => {
		const themes = findThemes(own());
		expect(themes[0]?.name).toMatch(/memori|lupa|kapasitas/);
		expect(themes[0]?.notes.length).toBeGreaterThanOrEqual(3);
	});
	it("status: recurring when it was in last week's map, done when a finished piece exists", () => {
		const first = run(syntheticVault());
		const name = first.memory.themes.at(-1)?.themes[0]?.name ?? "";
		expect(first.memory.themes.at(-1)?.themes[0]?.status).toBe("new");
		const history = [{ week: "2026-W46", themes: [{ name, weight: 0.5, status: "new" as const, claimIds: [] }] }];
		const again = run(syntheticVault(), { memory: { ...emptyMemory(), themes: history } });
		expect(again.memory.themes.find(t => t.week === "2026-W47")?.themes[0]?.status).toBe("recurring");
		expect(isMature(note({ path: "Published/x.md", body: "a" }))).toBe(true);
		expect(isMature(note({ path: "a/x.md", body: "a", frontmatter: { status: "published" } }))).toBe(true);
		expect(isMature(note({ path: "a/x.md", body: "a" }))).toBe(false);
	});
	it("text helpers", () => {
		expect(tokenize("Dan yang itu, Memori kerja 2026 penuh")).toEqual(["memori", "kerja", "penuh"]);
		expect(cosine(termFrequency(["aaaa", "bbbb"]), termFrequency(["aaaa", "bbbb"]))).toBeCloseTo(1);
		expect(cosine(termFrequency(["aaaa"]), termFrequency(["bbbb"]))).toBe(0);
		expect(sentences("Satu kalimat pendek. Dua kalimat lain yang agak lebih panjang di sini.")).toHaveLength(2);
		expect(guessLanguage(["yang dan untuk dengan tidak"])).toBe("id");
		expect(guessLanguage(["the and for with that this"])).toBe("en");
	});
});

describe("C3 insights", () => {
	const result = run(syntheticVault());
	it("cross: the dominant theme with its notes, spread over folders, no finished piece", () => {
		const c = result.analysis.cross;
		expect(c?.noteCount).toBeGreaterThanOrEqual(3);
		expect(c?.hasMature).toBe(false);
		expect(c?.folders.length).toBeGreaterThanOrEqual(2);
		expect(c?.oldRelated.map(l => l.path)).toContain("Systems thinking dan memori.md");
	});
	it("threads: a duplicate title, related notes that are not linked, and an overdue review", () => {
		const t = result.analysis.threads;
		expect(t?.duplicates.some(d => d.reason === "title")).toBe(true);
		expect(t?.unlinked.length).toBeGreaterThan(0);
		expect(t?.overdue[0]?.note.path).toBe("Ide/Ketika kapasitas lebih kecil dari keingintahuan.md");
	});
	it("a note that already links to the related one is not reported as unlinked", () => {
		const notes = syntheticVault().map(n =>
			n.path === "Pola Lupa.md" ? { ...n, links: ["Memori kerja dan Zeigarnik", "Ide/Ketika kapasitas lebih kecil dari keingintahuan"] } : n,
		);
		const t = run(notes).analysis.threads;
		const pairs = t?.unlinked.map(u => [u.a.title, u.b.title].sort().join("|")) ?? [];
		expect(pairs).not.toContain(["Pola Lupa", "Memori kerja dan Zeigarnik"].sort().join("|"));
	});
	it("hoarding: counts saved vs own, lists PDF stubs, suggests one reading close to the theme", () => {
		const h = result.analysis.hoarding;
		expect(h?.saved).toBe(15);
		expect(h?.own).toBe(6);
		expect(h?.pdfStubs).toHaveLength(3);
		expect(h?.reading?.note.path).toBeDefined();
	});
	it("stats count notes by kind and leave templates and empty files out", () => {
		expect(result.analysis.stats).toMatchObject({ own: 6, saved: 15, pdfStubs: 3 });
		expect(result.analysis.stats.changed).toBe(6 + 15);
	});
});

describe("C4 contradiction: only with two pieces of real evidence", () => {
	it("focus rule + notes spread over 4+ folders -> a contradiction with a verified quote and a measured count", () => {
		const c = run(syntheticVault()).analysis.contradiction;
		expect(c?.topic).toBe("focus");
		expect(c?.rule.quote).toMatch(/^Satu topik utama per periode/);
		expect(c?.rule.note.path).toBe("Ide/Ketika kapasitas lebih kecil dari keingintahuan.md");
		expect(c?.against.type).toBe("count");
		if (c?.against.type === "count") expect(c.against.value).toBeGreaterThanOrEqual(4);
	});
	it("no rule in the notes -> no contradiction (nothing is invented)", () => {
		const notes = syntheticVault().map(n => ({ ...n, body: n.body.replace(/Satu topik utama per periode\. Parkirkan dulu yang lainnya\.|Tampung, jangan langsung kejar\./g, "Hal lain.") }));
		expect(run(notes).analysis.contradiction).toBeUndefined();
	});
	it("a rule whose quote can no longer be found in its note is dropped", () => {
		const first = run(syntheticVault());
		// the bank still has the rule, but the note was edited since
		const edited = syntheticVault().map(n => ({ ...n, body: n.body.replace("Satu topik utama per periode.", "Fokus itu penting.") }));
		const second = run(edited, { memory: { ...emptyMemory(), claims: first.memory.claims } });
		expect(second.analysis.contradiction?.rule.quote ?? "").not.toMatch(/Satu topik utama per periode/);
	});
	it("the focus rule without a real spread (fewer than 4 folders) is not a contradiction", () => {
		const own = syntheticVault().filter(n => /^Ide\/|^Pola|^Memori|^Addiction|^Ketika/.test(n.path));
		expect(run(own).analysis.contradiction).toBeUndefined();
	});
	it("claim vs claim: 'never X' against 'I will X' needs three shared content words and two real quotes", () => {
		const notes = [
			note({ path: "Aturan.md", modified: daysAgo(10), body: "Jangan menulis esai panjang tentang adiksi layar sebelum riset selesai sepenuhnya." }),
			note({ path: "Rencana.md", modified: daysAgo(1), body: "Aku akan menulis esai panjang tentang adiksi layar dalam tiga hari ke depan dengan santai." }),
			note({ path: "A.md", modified: daysAgo(2), body: "Catatan tambahan tentang jadwal harian yang belum tertata dengan baik sekali." }),
			note({ path: "B.md", modified: daysAgo(3), body: "Catatan ketiga tentang kebiasaan olahraga pagi yang ingin dijaga lebih rutin lagi." }),
		];
		const warm = warmup({ notes, now: NOW, settings, memory: emptyMemory() });
		const c = run(notes, { memory: warm }).analysis.contradiction;
		expect(c?.topic).toBe("claims");
		expect(c?.against.type).toBe("quote");
		expect(c?.rule.note.path).not.toBe(c?.against.type === "quote" ? c.against.note.path : "");
	});
});

describe("C5 short version", () => {
	it("fewer than 3 own notes -> one old thread, one reading, one question", () => {
		const r = run(quietVault());
		expect(r.analysis.short).toBe(true);
		expect(r.points.map(p => p.kind)).toEqual(["threads", "hoarding", "question"]);
		expect(r.markdown).toContain("# Surat Otak singkat");
		expect(r.markdown).toContain("[[Lama/Ide lama");
		expect(r.markdown).toContain("[[Clippings/Resep");
	});
	it("with nothing at all, the letter is just a question", () => {
		const r = run([]);
		expect(r.points.map(p => p.kind)).toEqual(["question"]);
		expect(r.markdown).toContain("**");
	});
});

describe("C6 compose", () => {
	const r = run(syntheticVault());
	it("section order follows the template and there are at most 5 points", () => {
		expect(r.points.map(p => p.kind)).toEqual(["cross", "contradiction", "threads", "hoarding", "question"]);
		expect(r.points.length).toBeLessThanOrEqual(5);
		const headings = r.markdown.split("\n").filter(l => /^## \d\./.test(l));
		expect(headings).toHaveLength(5);
		expect(headings[0]).toContain("1. Lintas catatan");
	});
	it("every point except the question links to its source notes, and every link points at a real note", () => {
		const paths = new Set(syntheticVault().map(n => n.path.replace(/\.md$/, "")));
		for (const p of r.points) {
			if (p.kind === "question") continue;
			const links = [...p.body.matchAll(/\[\[([^\]|]+)/g)].map(m => m[1] as string);
			expect(links.length, p.heading).toBeGreaterThan(0);
			for (const l of links) expect(paths.has(l), l).toBe(true);
		}
	});
	it("frontmatter, stats line and feedback checklist (with kind markers) are present", () => {
		expect(r.markdown).toMatch(/^---\ntype: mind-letter\nweek: 2026-W47\nperiod: 2026-11-15 — 2026-11-21\nsources: \[obsidian\]/);
		expect(r.markdown).toContain("<small>Statistik:");
		expect(r.markdown).toMatch(/## Umpan balik \(centang = berguna/);
		expect(r.markdown).toContain("- [ ] 2 Pertentangan <!--contradiction-->");
	});
	it("quotes in the letter are exact copies from the notes", () => {
		const bodies = syntheticVault().map(n => n.body).join("\n");
		for (const m of r.markdown.matchAll(/^> "(.+)" — /gm)) expect(bodies.includes(m[1] as string), m[1]).toBe(true);
	});
	it("English letters use English wording and dates", () => {
		const en = runPipeline({ notes: syntheticVault(), now: NOW, settings: { ...settings, lang: "en" }, memory: emptyMemory(), generatedBy: "test" });
		expect(en.markdown).toContain("# Mind Letter — Week 47 (15–21 Nov 2026)");
		expect(en.markdown).toContain("Contradiction");
		expect(en.markdown).toContain("## Feedback (checked = useful");
	});
	it("the same input always gives the same letter", () => {
		expect(run(syntheticVault()).markdown).toBe(run(syntheticVault()).markdown);
	});
	it("composeLetter on its own matches the pipeline", () => {
		const out = composeLetter(r.meta, r.analysis, "id");
		expect(out.markdown).toBe(r.markdown);
		expect(buildPoints(r.analysis, "id", new Set(["cross"])).map(p => p.kind)).not.toContain("cross");
	});
});

describe("C7 shared data format", () => {
	it("claims.json / themes.json round-trip through serialize and parse", () => {
		const r = run(syntheticVault());
		expect(r.memory.claims.length).toBeGreaterThan(0);
		expect(parseClaims(serialize(r.memory.claims))).toEqual(r.memory.claims);
		expect(parseThemes(serialize(r.memory.themes))).toEqual(r.memory.themes);
		const c = r.memory.claims[0]!;
		expect(Object.keys(c).sort()).toEqual(["date", "id", "kind", "quote", "ref", "source", "theme"]);
		expect(c.quote.length).toBeLessThanOrEqual(200);
		expect(r.memory.themes[0]).toMatchObject({ week: "2026-W47" });
	});
	it("damaged or foreign data is skipped, never fatal", () => {
		expect(parseClaims("{not json")).toEqual([]);
		expect(parseClaims('[{"id":1},{"id":"K1","source":"obsidian","ref":"a","quote":"q","theme":"t","date":"2026-01-01","kind":"rule"},null,"x"]')).toHaveLength(1);
		expect(parseThemes('[{"week":"bad","themes":[]},{"week":"2026-W01","themes":[{"name":"a","weight":2,"status":"new"}]}]')[0]?.themes[0]?.weight).toBe(1);
		expect(parseFeedback('[{"week":"2026-W01","item":9,"useful":true},{"week":"2026-W01","item":2,"useful":false}]')).toHaveLength(1);
	});
	it("claims link to their theme entries by id", () => {
		const r = run(syntheticVault());
		const ids = new Set(r.memory.claims.map(c => c.id));
		for (const t of r.memory.themes[0]!.themes) for (const id of t.claimIds) expect(ids.has(id)).toBe(true);
	});
});

describe("feedback and warm-up", () => {
	const letter = (marks: string[]) =>
		[
			"---", "type: mind-letter", "week: 2026-W46", "---", "# x", "", "## Umpan balik (centang = berguna)",
			`- [${marks[0]}] 1 Lintas catatan <!--cross-->`, `- [${marks[1]}] 2 Pertentangan <!--contradiction-->`, `- [${marks[2]}] 3 Pertanyaan <!--question-->`,
		].join("\n");
	it("checked = useful; unchecked = not useful only when the letter was rated at all", () => {
		expect(parseFeedbackFromLetter(letter(["x", " ", "x"]))).toEqual([
			{ week: "2026-W46", item: 1, useful: true }, { week: "2026-W46", item: 2, useful: false }, { week: "2026-W46", item: 5, useful: true },
		]);
		expect(parseFeedbackFromLetter(letter([" ", " ", " "]))).toEqual([]);
		expect(parseFeedbackFromLetter("no frontmatter")).toEqual([]);
	});
	it("a kind marked not useful in two rated letters in a row is left out of the next letter; the question never is", () => {
		const fb: FeedbackItem[] = [
			{ week: "2026-W45", item: 3, useful: false }, { week: "2026-W46", item: 3, useful: false }, { week: "2026-W46", item: 5, useful: false },
			{ week: "2026-W45", item: 4, useful: false }, { week: "2026-W46", item: 4, useful: true },
		];
		const skip = suppressedKinds(fb);
		expect([...skip]).toEqual(["threads"]);
		const r = run(syntheticVault(), { memory: { ...emptyMemory(), feedback: fb } });
		expect(r.points.map(p => p.kind)).not.toContain("threads");
		expect(r.points.map(p => p.kind)).toContain("question");
	});
	it("warm-up seeds the theme map from the previous weeks, oldest first", () => {
		const notes = [
			note({ path: "a/m1.md", modified: daysAgo(10), tags: ["memori"], body: "Catatan tentang memori kerja yang penuh dan terbatas sekali." }),
			note({ path: "a/m2.md", modified: daysAgo(11), tags: ["memori"], body: "Catatan lain tentang memori jangka panjang dan lupa yang wajar." }),
			note({ path: "a/m3.md", modified: daysAgo(18), tags: ["memori"], body: "Catatan awal tentang memori, penyaring dan kapasitas perhatian kita." }),
			note({ path: "a/m4.md", modified: daysAgo(19), tags: ["memori"], body: "Catatan awal kedua tentang memori dan cara kerja ingatan manusia." }),
		];
		const mem = warmup({ notes, now: NOW, settings, memory: emptyMemory() });
		expect(mem.themes.map(t => t.week)).toEqual(["2026-W45", "2026-W46"]);
		expect(mem.themes[0]?.themes[0]?.status).toBe("new");
		expect(mem.themes[1]?.themes[0]?.status).toBe("recurring");
		expect(mem.claims.length).toBeGreaterThanOrEqual(0);
	});
	it("direction: a theme back for several weeks without a finished piece becomes the headline", () => {
		const base = run(syntheticVault());
		const name = base.analysis.cross?.theme ?? "";
		const history = ["2026-W44", "2026-W45", "2026-W46"].map(week => ({ week, themes: [{ name, weight: 0.5, status: "recurring" as const, claimIds: [] }] }));
		const r = run(syntheticVault(), { memory: { ...emptyMemory(), themes: history } });
		expect(r.analysis.cross?.weeks).toBe(4);
		expect(r.analysis.question.variant === "rule" || r.analysis.question.variant === "direction").toBe(true);
		expect(r.points[0]?.heading).toMatch(/^Arah: 4 minggu berputar/);
	});
});

describe("analyze() on its own", () => {
	it("returns a language-free analysis", () => {
		const r = run(syntheticVault());
		const a = analyze({ week: r.week, period: r.period, notes: r.classified, themes: findThemes(r.classified.filter(n => n.kind === "own" && inPeriod(n.modified, r.period))), history: [], claims: r.memory.claims, minOwnForFull: 3, directionWeeks: 3 });
		expect(a.short).toBe(false);
		expect(JSON.stringify(a)).not.toMatch(/Lintas catatan/);
	});
});
