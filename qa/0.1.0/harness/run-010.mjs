// GUI QA 0.1.0 in an ISOLATED Obsidian profile + SYNTHETIC temp vault. Never touches the user's own vaults.
// Usage: node qa/0.1.0/harness/run-010.mjs   (after `npm run build`)
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launch, sleep, vault, profile, base, PORT, connect } from "./obs.mjs";
import { makeVault } from "./make-vault.mjs";

// An empty Obsidian profile + vault skeleton (app.json, appearance.json, core-plugins.json) to start from; set MINDLETTER_QA_BASE.
const SRC = process.env.MINDLETTER_QA_BASE;
if (!SRC) throw new Error("Set MINDLETTER_QA_BASE to a folder with profile/ and vault/.obsidian/ from a clean Obsidian profile");
const root = join(tmpdir(), "mind-letter-qa-010");
const out = join(base, "qa", "0.1.0");
const shots = join(out, "screenshots");
rmSync(root, { recursive: true, force: true });
mkdirSync(shots, { recursive: true });
mkdirSync(vault, { recursive: true });
cpSync(join(SRC, "profile"), profile, { recursive: true });
makeVault(vault);
mkdirSync(join(vault, ".obsidian", "plugins", "mind-letter"), { recursive: true });
for (const f of ["app.json", "appearance.json", "core-plugins.json"]) cpSync(join(SRC, "vault", ".obsidian", f), join(vault, ".obsidian", f));
const install = () => {
	for (const f of ["main.js", "manifest.json", "styles.css"]) cpSync(join(base, f), join(vault, ".obsidian", "plugins", "mind-letter", f));
};
install();
writeFileSync(join(vault, ".obsidian", "community-plugins.json"), JSON.stringify(["mind-letter"]));
writeFileSync(join(profile, "obsidian.json"), JSON.stringify({ vaults: { qa010: { path: vault, ts: Date.now(), open: true } }, cli: false }));

console.log("Launching isolated Obsidian…", { vault, profile });
launch();
await sleep(4000);
const c = await connect();
const ev = c.ev;
await ev(`(()=>{ const b=[...document.querySelectorAll('.modal button')].find(b=>/Trust author/i.test(b.textContent)); if(b) b.click(); })()`);
await sleep(2000);
try {
	for (const t of await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()) if (t.type === "page" && t.url !== c.url) await fetch(`http://127.0.0.1:${PORT}/json/close/` + t.id);
} catch {}

const results = [];
const rec = (id, ok, detail) => {
	results.push({ id, ok, detail });
	writeFileSync(join(out, `${id}.md`), `# ${id}: ${ok === true ? "PASS" : ok === false ? "FAIL" : String(ok)}\n\n${detail}\n`, "utf8");
	console.log(`[${id}] ${ok === true ? "PASS" : ok === false ? "FAIL" : ok}: ${detail}`);
};
const shot = (name) => c.shot(join(shots, name.replace(/[:/*?"<>|]/g, " -") + ".png"));
const shotSettings = async (name) => {
	const ts = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
	const t = ts.find((x) => x.type === "page" && /^Settings/.test(x.title)) ?? ts.find((x) => x.type === "page");
	const ws = new WebSocket(t.webSocketDebuggerUrl);
	await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
	const data = await new Promise((res) => { ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id === 1) res(d.result.data); }; ws.send(JSON.stringify({ id: 1, method: "Page.captureScreenshot", params: { format: "png" } })); });
	ws.close();
	writeFileSync(join(shots, name + ".png"), Buffer.from(data, "base64"));
};
const settingsText = async () => {
	const ts = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
	const t = ts.find((x) => x.type === "page" && /^Settings/.test(x.title)) ?? ts.find((x) => x.type === "page");
	const ws = new WebSocket(t.webSocketDebuggerUrl);
	await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
	const v = await new Promise((res) => { ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id === 1) res(d.result.result.value); }; ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression: `[...document.querySelectorAll('.vertical-tab-content .setting-item')].map(e=>e.innerText.replace(/\\n+/g,' | ')).join('\\n')`, returnByValue: true } })); });
	ws.close();
	return v;
};

await c.send("Network.enable");
await c.send("Runtime.enable");
const consoleErrors = [];
await ev(`(()=>{ window.__notices=[]; setInterval(()=>{ for (const d of new Set([document, activeDocument])) for (const n of d.querySelectorAll('.notice')) { const t=n.textContent; if(t && !window.__notices.includes(t)) window.__notices.push(t); } }, 80); window.addEventListener('error', e=>console.error('uncaught', e.message)); })()`);
const mark = () => c.events.length;
const requestsSince = (i) => c.events.slice(i).filter((e) => e.method === "Network.requestWillBeSent").map((e) => e.params.request.url).filter((u) => /^https?:/.test(u) && !new RegExp(`127\\.0\\.0\\.1:${PORT}|devtools`).test(u));
const notices = () => ev(`window.__notices.slice()`);
const letterFiles = () => (existsSync(join(vault, "Mind Letter")) ? readdirSync(join(vault, "Mind Letter")).filter((n) => n.endsWith(".md")) : []);
const run = (id) => ev(`app.commands.executeCommandById(${JSON.stringify(id)})`);
const setData = async (patch) => {
	const f = join(vault, ".obsidian", "plugins", "mind-letter", "data.json");
	const cur = existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : {};
	writeFileSync(f, JSON.stringify({ ...cur, ...patch }, null, 2));
};
const reload = async () => {
	await ev(`(async()=>{ await app.plugins.disablePlugin('mind-letter'); await app.plugins.enablePlugin('mind-letter'); })()`);
	await sleep(1500);
};

// ---- Q1 loads ----
const ver = await ev(`app.plugins.plugins['mind-letter']?.manifest.version`);
rec("Q1-load", ver === "0.1.0", `plugin version in Obsidian: ${ver}`);
const cmds = await ev(`Object.keys(app.commands.commands).filter(k=>k.startsWith('mind-letter:'))`);
rec("Q1-commands", cmds.length === 3, `commands: ${cmds.join(", ")}`);
if (ver !== "0.1.0") throw new Error("plugin did not load");

// ---- Q2 Off mode letter, no network ----
let m = mark();
await run("mind-letter:write-letter");
await sleep(2500);
let files = letterFiles();
let letter = files[0] ? readFileSync(join(vault, "Mind Letter", files[0]), "utf8") : "";
const sections = (letter.match(/^## \d\./gm) ?? []).length;
const boxes = (letter.match(/^- \[ \] \d/gm) ?? []).length;
const links = (letter.match(/\[\[[^\]]+\]\]/g) ?? []).length;
rec("Q2-off-letter", /^\d{4}-W\d{2}\.md$/.test(files[0] ?? "") && sections >= 3 && boxes >= 3 && links >= 3 && letter.includes("(basic mode)"), `files: ${files.join(", ")}; sections ${sections}; checkboxes ${boxes}; links ${links}; generated-by basic mode: ${letter.includes("(basic mode)")}`);
writeFileSync(join(out, "sample-letter.md"), letter);
const reqs = requestsSince(m);
rec("Q3-no-network", reqs.length === 0, `external requests with AI off: ${reqs.length} ${reqs.join(", ")}`);
const nt = await notices();
rec("Q2-notice", nt.some((x) => /Mind Letter/.test(x)), `notices: ${JSON.stringify(nt)}`);
const active = await ev(`app.workspace.getActiveFile()?.path`);
rec("Q2-opens-letter", /Mind Letter\/\d{4}-W\d{2}\.md$/.test(active ?? ""), `active file: ${active}`);
await sleep(600);
await shot("Q2 letter opened in Obsidian");

// ---- Q4 memory ----
const memDir = join(vault, "Mind Letter", ".memory");
const memFiles = existsSync(memDir) ? readdirSync(memDir) : [];
const claims = existsSync(join(memDir, "claims.json")) ? JSON.parse(readFileSync(join(memDir, "claims.json"), "utf8")) : [];
rec("Q4-memory", ["claims.json", "themes.json", "feedback.json", "meta.json"].every((f) => memFiles.includes(f)) && claims.length > 0, `memory files: ${memFiles.join(", ")}; claims: ${claims.length}`);

// ---- Q5 feedback loop ----
const fileA = join(vault, "Mind Letter", files[0]);
writeFileSync(fileA, letter.replace(/^- \[ \] 1 /m, "- [x] 1 "));
await sleep(500);
await run("mind-letter:write-letter");
await sleep(2500);
files = letterFiles();
const fb = JSON.parse(readFileSync(join(memDir, "feedback.json"), "utf8"));
rec("Q5-feedback", files.length === 2 && fb.some((f) => f.useful === true), `letters: ${files.join(", ")} (existing letter kept, numbered copy added); feedback entries: ${JSON.stringify(fb)}`);

// ---- Q6 settings tab: AI off default, no external calls when opening it ----
m = mark();
await ev(`app.commands.executeCommandById('app:open-settings')`);
await sleep(700);
await ev(`app.setting.openTabById("mind-letter")`);
await sleep(900);
let st = await settingsText();
rec("Q6-settings-render", /AI/.test(st) && /Language|Bahasa/.test(st) && /Privacy|Privasi/.test(st), st.split("\n").slice(0, 10).join(" // "));
await shotSettings("Q6 settings AI off");
rec("Q6-settings-no-network", requestsSince(m).length === 0, `external requests when opening settings: ${requestsSince(m).length}`);
const dataFile = join(vault, ".obsidian", "plugins", "mind-letter", "data.json");
const aiDefault = existsSync(dataFile) ? JSON.parse(readFileSync(dataFile, "utf8")) : {};
rec("Q6-default-off", !aiDefault.ai || aiDefault.ai.provider === "off", `saved ai: ${JSON.stringify(aiDefault.ai ?? "(defaults)")}`);

// ---- Q7 AI settings: CLI detect, local, API without key ----
const setProvider = async (p, extra = {}) => {
	await ev(`(async()=>{ const pl=app.plugins.plugins['mind-letter']; Object.assign(pl.settings.ai, ${JSON.stringify({ provider: p, ...extra })}); await pl.saveSettings(); app.setting.activeTab.display(); })()`);
	await sleep(500);
};
const clickCheck = async () => {
	const ts = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
	const t = ts.find((x) => x.type === "page" && /^Settings/.test(x.title)) ?? ts.find((x) => x.type === "page");
	const ws = new WebSocket(t.webSocketDebuggerUrl);
	await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
	await new Promise((res) => { ws.onmessage = (mm) => { if (JSON.parse(mm.data).id === 1) res(); }; ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression: `[...document.querySelectorAll('.vertical-tab-content button')].find(b=>/Check connection|Cek koneksi/.test(b.textContent))?.click()`, returnByValue: true } })); });
	ws.close();
};
await setProvider("cli", { cli: "claude" });
m = mark();
await clickCheck();
await sleep(15000);
st = await settingsText();
rec("Q7-claude-detect", /Connected|Terhubung/.test(st), st.split("\n").filter((l) => /Check|Cek|Connected|Terhubung|Not connected/.test(l)).join(" // "));
await shotSettings("Q7 Claude Code detected");
for (const [tool, id] of [["codex", "Q7-codex-detect-only"], ["agy", "Q7-agy-detect-only"], ["gemini", "Q7-gemini-detect-only"]]) {
	await setProvider("cli", { cli: tool, model: "" });
	await clickCheck();
	await sleep(tool === "agy" ? 12000 : 6000);
	st = await settingsText();
	const expectNotInstalled = tool === "gemini"; // Gemini CLI is not installed on the QA machine: it must say so, not "Connected"
	rec(id, /Detect only|Deteksi saja/.test(st) && (!expectNotInstalled || /Not connected|Tidak terhubung/.test(st)), st.split("\n").filter((l) => /Detect only|Deteksi saja|Connected|Not connected|Terhubung/.test(l)).join(" // "));
	if (tool === "agy") await shotSettings("Q7 agy detect-only");
}
await setProvider("local", { local: "ollama", model: "" });
m = mark();
await clickCheck();
await sleep(5000);
st = await settingsText();
const localReq = requestsSince(m);
rec("Q7-local", /Connected|Not connected|Terhubung|Tidak terhubung/.test(st) && localReq.every((u) => /^http:\/\/localhost:11434/.test(u)), `status: ${st.split("\n").filter((l) => /Connected|Not connected|Terhubung/.test(l)).join(" // ")}; requests: ${localReq.join(", ") || "(none visible)"}`);
await setProvider("api", { api: "openai", apiKey: "", model: "" });
m = mark();
await clickCheck();
await sleep(2500);
st = await settingsText();
rec("Q7-api-no-key", /API key required|Perlu kunci API/.test(st) && requestsSince(m).length === 0, `status: ${st.split("\n").filter((l) => /key|kunci/i.test(l)).join(" // ")}; requests: ${requestsSince(m).length}`);
await shotSettings("Q7 API no key");

// ---- Q8 not approved: no AI call ----
await setProvider("cli", { cli: "claude", model: "", approvedSlot: "" });
m = mark();
await run("mind-letter:write-letter");
await sleep(3000);
nt.length = 0;
const nt8 = await notices();
rec("Q8-not-approved", nt8.some((x) => /not approved|belum disetujui/.test(x)), `notices: ${JSON.stringify(nt8.slice(-3))}`);

// ---- Q9 real Claude Code letter (approved, synthetic vault only) ----
await setProvider("cli", { cli: "claude", model: "", approvedSlot: "cli:claude" });
rmSync(join(vault, "Mind Letter"), { recursive: true, force: true });
await sleep(500);
await run("mind-letter:write-letter");
let aiFiles = [];
for (let i = 0; i < 40 && aiFiles.length === 0; i++) {
	await sleep(3000);
	aiFiles = letterFiles();
}
await sleep(1000);
const aiLetter = aiFiles[0] ? readFileSync(join(vault, "Mind Letter", aiFiles[0]), "utf8") : "";
const nt9 = await notices();
writeFileSync(join(out, "sample-letter-ai.md"), aiLetter);
const usedAi = /generated-by: Mind Letter 0\.1\.0 \(AI:/.test(aiLetter);
rec("Q9-claude-letter", aiLetter.includes("type: mind-letter"), `letter written: ${aiFiles.join(", ")}; reworded by AI: ${usedAi}; notices: ${JSON.stringify(nt9.slice(-2))}`);

// ---- Q10 weekly schedule ----
await setProvider("off", { approvedSlot: "" });
rmSync(join(vault, "Mind Letter"), { recursive: true, force: true });
await setData({ autoWeekly: false });
await reload();
await sleep(3000);
rec("Q10-schedule-off", letterFiles().length === 0, `autoWeekly off, plugin reloaded: letters written: ${letterFiles().length}`);
const dow = new Date().getDay();
await setData({ autoWeekly: true, weekday: dow, hour: 0 });
await reload();
let sched = [];
for (let i = 0; i < 20 && sched.length === 0; i++) {
	await sleep(1000);
	sched = letterFiles();
}
rec("Q10-schedule-on", sched.length === 1, `autoWeekly on (today, hour 0), plugin reloaded: letters: ${sched.join(", ")}`);
await reload();
await sleep(3000);
rec("Q10-no-duplicate", letterFiles().length === 1, `after another reload the same week is not written twice: ${letterFiles().length} letter(s)`);

writeFileSync(join(out, "RESULTS.json"), JSON.stringify(results, null, 2));
const failed = results.filter((r) => r.ok !== true);
writeFileSync(join(out, "RESULTS.md"), `# QA 0.1.0 (isolated Obsidian, synthetic vault)\n\n` + results.map((r) => `- ${r.ok === true ? "PASS" : "FAIL"} ${r.id}: ${r.detail}`).join("\n") + "\n");
console.log(`\n${results.length - failed.length}/${results.length} passed`);
c.close();
process.exit(0);
