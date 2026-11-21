import type { NoteRecord } from "@mind-letter/core";

/** "Now" for every fixture: Saturday 21 Nov 2026, 12:00 local time (ISO week 2026-W47, Mon 16 - Sun 22 Nov). */
export const NOW = new Date(2026, 10, 21, 12, 0, 0).getTime();
const DAY = 86400000;

/** A moment `d` days before NOW (same clock time). */
export const daysAgo = (d: number): number => NOW - d * DAY;

let counter = 0;

export function note(over: Partial<NoteRecord> & { path: string; body: string }): NoteRecord {
	counter++;
	const base = over.path.split("/").pop()?.replace(/\.md$/i, "") ?? over.path;
	const modified = over.modified ?? daysAgo(1);
	return {
		id: over.id ?? `n${counter}`,
		source: "obsidian",
		title: over.title ?? base,
		path: over.path,
		created: over.created ?? modified,
		modified,
		sizeBytes: over.sizeBytes ?? Math.max(1, over.body.length),
		body: over.body,
		links: over.links ?? [],
		tags: over.tags ?? [],
		frontmatter: over.frontmatter,
	};
}

const LONG_TEXT = (topic: string): string =>
	`${topic}. `.repeat(3) +
	"Teks ini cukup panjang supaya dianggap bacaan yang punya isi, bukan cuma tautan. ".repeat(4) +
	`Pembahasan tentang ${topic} dan keterkaitannya dengan banyak hal lain dalam kehidupan sehari-hari.`;

/**
 * A synthetic vault shaped like the real first letter (2026-W47): a few notes of the person's own about memory and
 * forgetting, a rule about "one topic per period", a pile of saved clippings, books and PDF stubs, one duplicate title,
 * two related notes that are not linked, an overdue review, a template and an empty file. All text is invented.
 */
export function syntheticVault(): NoteRecord[] {
	counter = 0;
	const notes: NoteRecord[] = [];
	const add = (n: NoteRecord) => notes.push(n);

	// ---- own writing, this week ----
	add(note({
		path: "Ide/Ketika kapasitas lebih kecil dari keingintahuan.md",
		modified: daysAgo(4),
		tags: ["memori", "fokus"],
		frontmatter: { status: "seed", review: "2026-11-10" },
		body:
			"Ketika kapasitas otak lebih kecil dibandingkan keingintahuan, memori terasa penuh dan banyak hal terlupa.\n\n" +
			"Satu topik utama per periode. Parkirkan dulu yang lainnya.\n\n" +
			"Tampung, jangan langsung kejar.\n\n" +
			"Menurutku masalahnya ada pada tidak adanya penyaring dan urutan untuk memori kerja.\n\n" +
			"Lupa saat overload terjadi karena informasi tidak sempat tersimpan di memori, bukan hilang begitu saja.\n\n" +
			"Efek Zeigarnik membuat tugas yang belum selesai terus mengganggu memori kerja dan membuat kita lupa hal lain.",
	}));
	add(note({
		path: "Ketika kapasitas lebih kecil dari keingintahuan.md",
		modified: daysAgo(6),
		body: "Versi pendek catatan tentang memori yang penuh, keingintahuan, dan lupa. Satu paragraf saja.",
	}));
	add(note({
		path: "Pola Lupa.md",
		modified: daysAgo(3),
		tags: ["memori"],
		body:
			"Semakin dipaksa diingat, semakin sulit diingat. Lupa adalah pola yang bisa dipelajari, bukan kegagalan.\n\n" +
			"Pola lupa muncul ketika memori kerja penuh, sehingga memori jangka panjang tidak sempat menyimpan apa pun dengan baik.",
	}));
	add(note({
		path: "Memori kerja dan Zeigarnik.md",
		modified: daysAgo(2),
		tags: ["memori"],
		body:
			"Memori kerja terbatas, dan efek Zeigarnik membuat tugas yang belum selesai tetap aktif di memori sehingga kapasitas berkurang.\n\n" +
			"Ketika memori kerja penuh, lupa menjadi hal yang wajar; kapasitas dan keingintahuan perlu diatur dengan penyaring.",
	}));
	add(note({
		path: "Addiction.md",
		modified: daysAgo(5),
		body: "Aku ingin menulis tentang adiksi dopamin dan layar. Rencanaku menulis tiga paragraf minggu depan tentang kebiasaan layar.",
	}));
	add(note({
		path: "Video/Tips Google Flow.md",
		modified: daysAgo(1),
		body: "Untuk detail produk yang rumit, buat scene kurang dari lima detik supaya hasil video tetap konsisten dan jelas.",
	}));

	// ---- saved material, this week ----
	for (let i = 1; i <= 6; i++) {
		add(note({
			path: `Clippings/Artikel agen AI ${i}.md`,
			modified: daysAgo(1 + (i % 3)),
			frontmatter: { source: `https://contoh.example/artikel-${i}` },
			body: LONG_TEXT(`agen AI nomor ${i} dengan RAG dan MCP`),
		}));
	}
	for (let i = 1; i <= 6; i++) {
		add(note({
			path: `Filsafat/Buku filsafat ${i}.md`,
			modified: daysAgo(2),
			sizeBytes: 260 * 1024,
			body: LONG_TEXT(`filsafat buku ${i} tentang memori dan pengetahuan`),
		}));
	}
	for (let i = 1; i <= 3; i++) {
		add(note({ path: `Papers/paper-${i}.md`, modified: daysAgo(3), body: `![[paper-${i}.pdf]]` }));
	}
	add(note({
		path: "Clippings/Ilusi kedalaman penjelasan.md",
		modified: daysAgo(40),
		frontmatter: { source: "https://contoh.example/ilusi" },
		body: LONG_TEXT("ilusi kedalaman penjelasan: menyimpan sesuatu terasa seperti sudah memahami memori dan lupa"),
	}));

	// ---- older own notes ----
	add(note({
		path: "Systems thinking dan memori.md",
		modified: daysAgo(30),
		body: "Systems thinking membantu melihat memori sebagai sistem: lupa bukan kegagalan, melainkan hasil dari kapasitas dan penyaring yang bekerja bersama.",
	}));
	add(note({ path: "Reading list ide.md", modified: daysAgo(45), body: "Daftar bacaan lama tentang produktivitas dan kebiasaan membaca dengan tenang." }));

	// ---- noise ----
	add(note({ path: "Templates/Harian.md", modified: daysAgo(1), body: "# {{date}}\n\nIsi template harian." }));
	add(note({ path: "Kosong.md", modified: daysAgo(1), body: "", sizeBytes: 0 }));
	return notes;
}

/** A vault with only two own notes this week, to exercise the short version. */
export function quietVault(): NoteRecord[] {
	counter = 1000;
	return [
		note({ path: "Satu.md", modified: daysAgo(2), body: "Catatan singkat pertama tentang rencana perjalanan akhir tahun yang masih samar." }),
		note({ path: "Dua.md", modified: daysAgo(1), body: "Catatan kedua tentang anggaran dan prioritas bulan depan yang belum jelas." }),
		note({
			path: "Lama/Ide lama.md",
			modified: daysAgo(30),
			frontmatter: { review: "2026-10-01" },
			body: "Ide lama tentang belajar memasak dengan lebih teratur, masih layak dibuka lagi suatu hari nanti.",
		}),
		note({
			path: "Clippings/Resep.md",
			modified: daysAgo(20),
			frontmatter: { source: "https://contoh.example/resep" },
			body: LONG_TEXT("resep masakan rumahan sederhana"),
		}),
	];
}
