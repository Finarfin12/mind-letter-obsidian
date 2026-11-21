# Mind Letter

*English: [README.md](README.md)*

Seminggu sekali, Mind Letter membaca **catatanmu sendiri** dan menulis surat pendek untukmu, sebagai catatan biasa di vault. Ia mencari hal-hal yang gampang terlewat kalau kamu sendiri yang menulis:

1. **Lintas catatan**: topik yang terus muncul di folder berbeda, dan apakah sudah pernah jadi tulisan matang.
2. **Pertentangan**: dua hal yang kamu tulis yang saling bertolak, dikutip persis, lengkap dengan tautan.
3. **Benang terputus**: judul kembar, catatan berkaitan yang belum bertaut, review yang lewat jadwal.
4. **Penimbunan**: berapa banyak yang kamu simpan (kliping, buku, PDF) dibanding yang kamu tulis, plus satu hal yang layak dibaca duluan.
5. **Satu pertanyaan** untuk dipikirkan, bukan dijawab di situ.

Setiap poin menaut ke catatan di baliknya. Maksimal 5 poin. Kalau tidak ada yang benar-benar bisa dikatakan, surat jadi lebih pendek, bukan mengarang. Kalau minggu itu kamu menulis kurang dari 3 catatan, kamu mendapat surat versi pendek.

**Berfungsi penuh tanpa AI.** Semua temuan di atas dari aturan. AI hanya tambahan opsional yang menulis ulang hasilnya.

## Pasang

Mind Letter belum ada di direktori komunitas. Pasang manual:

1. Unduh `main.js`, `manifest.json`, dan `styles.css` dari [rilis terbaru](https://github.com/Finarfin12/mind-letter-obsidian/releases/latest).
2. Taruh di `<vault-mu>/.obsidian/plugins/mind-letter/`.
3. Di Obsidian: Settings → Community plugins → aktifkan **Mind Letter**.

Butuh Obsidian 1.8.7 atau lebih baru. Jalan di desktop dan mobile (penyedia CLI hanya di desktop).

## Pakai

- Command palette → **Tulis surat minggu ini** (atau ikon surat di ribbon). Surat disimpan sebagai `Mind Letter/2026-W47.md` lalu dibuka. Surat yang sudah ada tidak pernah ditimpa: kamu mendapat `2026-W47 (2).md`.
- **Buka surat terbaru** dan **Bangun peta tema dari 8 minggu terakhir (pemanasan)** juga ada sebagai command. Surat pertama melakukan pemanasan sendiri, jadi riwayat tema (baru / berulang) tidak kosong di hari pertama.
- **Jadwal mingguan** (Settings → *Tulis surat tiap minggu*): mati secara bawaan. Bila menyala, surat ditulis begitu Obsidian terbuka setelah hari dan jam yang kamu pilih, paling banyak sekali seminggu.
- **Umpan balik**: tiap surat diakhiri daftar centang. Centang poin yang berguna. Kotak yang tidak dicentang dihitung "tidak berguna" hanya bila kamu mencentang minimal satu kotak (surat yang tidak pernah kamu nilai tidak mengajarkan apa-apa). Jenis poin yang kamu nilai tidak berguna di dua surat terakhir yang kamu nilai tidak dimuat di surat berikutnya. Pertanyaan penutup tidak pernah dilewatkan.

Pengaturan: bahasa surat (otomatis mengikuti catatanmu; Indonesia dan Inggris), folder surat, folder yang diabaikan, jadwal, AI.

## Di mana data disimpan

- Surat: `Mind Letter/YYYY-Www.md` (foldernya bisa diubah).
- Memori: `Mind Letter/.memory/` berupa JSON biasa: `claims.json` (kutipan pendek persis dari aturan, opini, dan rencana di catatanmu, untuk mencari pertentangan), `themes.json` (tema per minggu), `feedback.json`, `meta.json`. Hapus foldernya untuk mulai dari nol.
- Pengaturan: `data.json` plugin.

## Privasi dan apa yang berjalan di komputermu

**Dengan AI mati (bawaan), plugin tidak membuat permintaan jaringan dan tidak menjalankan program apa pun.** Ia membaca catatanmu lewat API Obsidian dan menulis surat serta file memori di vault-mu. Catatan di folder Mind Letter sendiri dan di folder yang kamu abaikan tidak pernah dibaca.

Saat AI dinyalakan, **tidak ada yang dikirim sebelum kamu menyetujui penyedia itu** lewat dialog. Persetujuan berlaku untuk satu penyedia: mengganti penyedia atau alamat meminta persetujuan lagi. AI tidak pernah melihat catatan utuh: hanya kutipan pendek, judul, dan tautan yang sudah ada di surat hasil aturan (maksimal 6000 karakter secara bawaan). Apa pun balasannya diperiksa: setiap tautan harus yang sudah ditemukan aturan, setiap kutipan harus salinan persis, tanpa URL, HTML, atau kode, dan ada batas panjang. Yang gagal diperiksa memakai kalimat hasil aturan. Kalau AI gagal, kamu tetap mendapat surat hasil aturan.

Penyedia AI, sesuai urutan di pengaturan:

| Penyedia | Yang terjadi | Menulis surat? |
| --- | --- | --- |
| **Claude Code** (CLI terpasang) | Plugin **menjalankan program `claude` di komputermu** dengan semua tool dimatikan (`--tools ""`), permintaan izin ditolak, tanpa menyimpan sesi, safe mode, tanpa MCP, di folder sementara kosong, tanpa shell. Teks lewat stdin. Untuk mendaftar model, plugin menjalankan `claude --help`, membaca nama model di `~/.claude/settings.json`, dan memindai file program untuk nama model. Plugin tidak pernah membuka file login atau token. | Ya |
| **Codex, Gemini CLI, Antigravity (`agy`)** | Hanya dideteksi: pengaturan bisa menampilkan daftar modelnya (Codex: `~/.codex/config.toml` dan `models_cache.json`; `agy`: menjalankan `agy models`; Gemini: `~/.gemini/settings.json`). Mereka **tidak pernah menerima teks catatan**, karena tidak ada cara terverifikasi untuk mematikan semua tool mereka (dalam uji nyata `agy` tetap menulis file dan membaca file di luar workspace-nya). | Tidak |
| **Ollama / LM Studio** (model lokal) | Teks hanya ke server di komputer ini (`localhost`). | Ya |
| **API cloud** (OpenAI, Anthropic, Google Gemini) | Teks dikirim ke penyedia itu lewat `https`. Kamu harus mengisi kunci API; kunci disimpan **sebagai teks biasa di `data.json` plugin** dan ikut tersinkron bila vault-mu disinkronkan. Kunci hanya dikirim ke alamat yang kamu atur. | Ya |

Daftar model berasal dari penyedia itu sendiri (`--help`, file CLI-nya, `agy models`, `/api/tags`, `/models`). Tidak ada daftar model bawaan, dan tidak ada nama model yang ditulis permanen di kode. Penyedia cloud tanpa kunci tidak membuat permintaan sama sekali.

## Skill agen (surat lintas sumber)

Plugin sengaja hanya membaca vault yang sedang terbuka. Untuk surat lintas beberapa sumber (Obsidian, Notion, aplikasi catatan lain yang tersambung), pakai **skill agen Mind Letter** yang terpisah: [github.com/Finarfin12/mind-letter-skill](https://github.com/Finarfin12/mind-letter-skill). Aturan dan format memorinya sama dengan plugin, dan dijalankan oleh agen AI yang bisa membaca catatanmu (mis. Claude Code, Codex). Cara pasangnya ada di repo tersebut.

## Batas

- Plugin sengaja hanya membaca vault yang sedang terbuka. Untuk vault lain dan Notion, pakai skill agen di atas.
- Pertentangan butuh satu kutipan persis plus kutipan kedua atau hitungan terukur. Kalau aturan tidak bisa membuktikannya, bagian itu tidak muncul.
- Hitungan "disimpan vs ditulis sendiri" adalah perkiraan dari folder, ukuran, dan front matter; surat menyebutnya begitu.

## Pengembangan

```
npm ci
npm test       # aturan core, lapisan AI, logika plugin (vitest)
npm run lint
npm run build  # cek tipe + bundel main.js
```

Langkah lint menganggap `no-misused-promises` dan `no-floating-promises` sebagai error. Jalankan kerja async dari callback yang harus mengembalikan `void` dengan `runAsync(fn, onError)` (`src/run-async.ts`), jangan dengan callback `async` langsung.

Logikanya ada di dua paket tanpa import Obsidian, supaya bisa dipakai antarmuka lain: `packages/core` (`@mind-letter/core`: klasifikasi, klaim, tema, temuan, penyusunan surat, memori, pemeriksaan hasil AI) dan `packages/ai` (`@mind-letter/ai`: deteksi penyedia, flag keamanan, penyedia). Plugin di `src/` hanya lapisan tipis di atasnya.

## Lisensi

MIT
