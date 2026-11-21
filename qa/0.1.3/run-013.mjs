// GUI QA 0.1.3 (F5) in an ISOLATED Obsidian profile + SYNTHETIC vault. Never touches the user's own vaults.
// Usage: MINDLETTER_QA_BASE=<folder with profile/ and vault/.obsidian/> node qa/0.1.3/run-013.mjs   (after `npm run build`)
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launch, sleep, vault, profile, base, PORT, connect } from "../0.1.0/harness/obs.mjs";
import { makeVault } from "../0.1.0/harness/make-vault.mjs";

const SRC = process.env.MINDLETTER_QA_BASE;
if (!SRC) throw new Error("Set MINDLETTER_QA_BASE to a folder with profile/ and vault/.obsidian/");
const out = join(base, "qa", "0.1.3");
const shots = join(out, "screenshots");
rmSync(join(tmpdir(), "mind-letter-qa-010"), { recursive: true, force: true });
mkdirSync(shots, { recursive: true });
mkdirSync(vault, { recursive: true });
cpSync(join(SRC, "profile"), profile, { recursive: true });
makeVault(vault);
const pdir = join(vault, ".obsidian", "plugins", "mind-letter");
mkdirSync(pdir, { recursive: true });
for (const f of ["app.json", "appearance.json", "core-plugins.json"]) cpSync(join(SRC, "vault", ".obsidian", f), join(vault, ".obsidian", f));
for (const f of ["main.js", "manifest.json", "styles.css"]) cpSync(join(base, f), join(pdir, f));
writeFileSync(join(vault, ".obsidian", "community-plugins.json"), JSON.stringify(["mind-letter"]));
writeFileSync(join(profile, "obsidian.json"), JSON.stringify({ vaults: { qa013: { path: vault, ts: Date.now(), open: true } }, cli: false }));

launch();
await sleep(4000);
const c = await connect();
const ev = c.ev;
await ev(`(()=>{ const b=[...document.querySelectorAll('.modal button')].find(b=>/Trust author/i.test(b.textContent)); if(b) b.click(); })()`);
await sleep(2000);
try {
	for (const t of await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()) if (t.type === "page" && t.url !== c.url) await fetch(`http://127.0.0.1:${PORT}/json/close/` + t.id);
} catch {}
await ev(`(()=>{ window.__notices=[]; setInterval(()=>{ for (const d of new Set([document, activeDocument])) for (const n of d.querySelectorAll('.notice')) { const t=n.textContent; if(t && !window.__notices.includes(t)) window.__notices.push(t); } }, 60); })()`);

const results = [];
const rec = (id, ok, detail) => {
	results.push({ id, ok, detail });
	writeFileSync(join(out, `${id}.md`), `# ${id}: ${ok ? "PASS" : "FAIL"}\n\n${detail}\n`);
	console.log(`[${id}] ${ok ? "PASS" : "FAIL"}: ${detail}`);
};
const dataFile = join(pdir, "data.json");
const data = () => (existsSync(dataFile) ? JSON.parse(readFileSync(dataFile, "utf8")) : {});
const reload = async () => {
	await ev(`(async()=>{ await app.plugins.disablePlugin('mind-letter'); await app.plugins.enablePlugin('mind-letter'); })()`);
	await sleep(1500);
};
/** Run JS inside the Settings window (a separate CDP target). */
const inSettings = async (expression) => {
	const ts = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
	const t = ts.find((x) => x.type === "page" && /^Settings/.test(x.title)) ?? ts.find((x) => x.type === "page" && x.url !== c.url) ?? ts.find((x) => x.type === "page");
	if (!t) throw new Error("no settings window");
	const ws = new WebSocket(t.webSocketDebuggerUrl);
	await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
	const v = await new Promise((res, rej) => {
		ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id === 1) d.result.exceptionDetails ? rej(new Error(JSON.stringify(d.result.exceptionDetails))) : res(d.result.result.value); };
		ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression, awaitPromise: true, returnByValue: true } }));
	});
	ws.close();
	return v;
};
const shotSettings = async (name) => {
	const ts = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
	const t = ts.find((x) => x.type === "page" && /^Settings/.test(x.title)) ?? ts.find((x) => x.type === "page" && x.url !== c.url) ?? ts.find((x) => x.type === "page");
	const ws = new WebSocket(t.webSocketDebuggerUrl);
	await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
	const data64 = await new Promise((res) => { ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id === 1) res(d.result.data); }; ws.send(JSON.stringify({ id: 1, method: "Page.captureScreenshot", params: { format: "png" } })); });
	ws.close();
	writeFileSync(join(shots, name + ".png"), Buffer.from(data64, "base64"));
};
const openTab = async () => {
	await ev(`app.commands.executeCommandById('app:open-settings')`);
	await sleep(700);
	await ev(`app.setting.openTabById("mind-letter")`);
	await sleep(900);
};
// find a setting row by its visible name, then act on its control
const row = (name) => `[...document.querySelectorAll('.vertical-tab-content .setting-item')].find(e=>e.querySelector('.setting-item-name')?.textContent.trim()===${JSON.stringify(name)})`;
const setSelect = (name, value) => inSettings(`(()=>{ const r=${row(name)}; const s=r.querySelector('select'); s.value=${JSON.stringify(value)}; s.dispatchEvent(new Event('change',{bubbles:true})); return s.value; })()`);
const setText = (name, value) => inSettings(`(()=>{ const r=${row(name)}; const i=r.querySelector('input,textarea'); i.value=${JSON.stringify(value)}; i.dispatchEvent(new Event('input',{bubbles:true})); return i.value; })()`);
const toggle = (name) => inSettings(`(()=>{ const r=${row(name)}; r.querySelector('.checkbox-container').click(); return true; })()`);
const clickBtn = (name) => inSettings(`(()=>{ const r=${row(name)}; r.querySelector('button').click(); return true; })()`);

const ver = await ev(`app.plugins.plugins['mind-letter']?.manifest.version`);
rec("F5-version", ver === "0.1.3", `plugin version in Obsidian: ${ver}`);

await openTab();
await shotSettings("F5 settings default");
// every setting changes and persists
await setSelect("Language of the letter", "en");
await setText("Folder for letters", "Letters QA");
await setText("Folders to ignore", "Private\nJournal");
await toggle("Write a letter every week");
await sleep(600);
await setSelect("Day", "3");
await inSettings(`(()=>{ const r=${row("Hour (0-23)")}; const s=r.querySelector('input[type=range]'); s.value='8'; s.dispatchEvent(new Event('input',{bubbles:true})); s.dispatchEvent(new Event('change',{bubbles:true})); return s.value; })()`);
await setSelect("AI", "local");
await sleep(500);
await setSelect("Provider", "lmstudio");
await setText("Address (optional)", "http://localhost:1234/v1");
await sleep(500);
await shotSettings("F5 settings changed");
const d1 = data();
const ok1 = d1.language === "en" && d1.letterFolder === "Letters QA" && JSON.stringify(d1.excludedFolders) === JSON.stringify(["Private", "Journal"]) && d1.autoWeekly === true && d1.weekday === 3 && d1.hour === 8 && d1.ai?.provider === "local" && d1.ai?.local === "lmstudio" && d1.ai?.localUrl === "http://localhost:1234/v1";
rec("F5-settings-change", ok1, `data.json after changes: ${JSON.stringify(d1)}`);

await ev(`app.setting.close?.()`);
await reload();
const d2 = await ev(`JSON.stringify(app.plugins.plugins['mind-letter'].settings)`);
const s2 = JSON.parse(d2);
rec("F5-settings-persist", s2.language === "en" && s2.letterFolder === "Letters QA" && s2.weekday === 3 && s2.hour === 8 && s2.ai.local === "lmstudio" && s2.excludedFolders.length === 2, `settings after reloading the plugin: ${d2}`);

// Check connection + Approve/Revoke
await openTab();
await clickBtn("Check connection and detect models");
await sleep(3000);
const status = await inSettings(`${row("Check connection and detect models")}.querySelector('.setting-item-description').textContent`);
rec("F5-check-connection", /Connected|Not connected/.test(status), `status line: ${status}`);
await clickBtn("Approval");
await sleep(800);
const modal = await inSettings(`[...document.querySelectorAll('.modal')].map(m=>m.textContent).join('|')`);
rec("F5-approve-modal", /Approve AI provider/.test(modal), `modal text: ${modal.slice(0, 160)}`);
await inSettings(`(()=>{ const b=[...document.querySelectorAll('.modal button')].find(b=>/^Approve$/.test(b.textContent)); b?.click(); return !!b; })()`);
await sleep(800);
const approved = (data().ai ?? {}).approvedSlot;
rec("F5-approve", approved === "local:lmstudio:http://localhost:1234/v1", `approvedSlot: ${approved}`);
await clickBtn("Approval");
await sleep(800);
const revoked = (data().ai ?? {}).approvedSlot;
rec("F5-revoke", revoked === "", `approvedSlot after Revoke: ${JSON.stringify(revoked)}`);

// simulated save failure -> Notice, no unhandled rejection
const rejections = [];
await c.send("Runtime.enable");
await ev(`window.__unhandled=[]; window.addEventListener('unhandledrejection', e=>window.__unhandled.push(String(e.reason)));`);
await ev(`(()=>{ const p=app.plugins.plugins['mind-letter']; p.__orig=p.saveSettings; p.saveSettings=()=>Promise.reject(new Error('disk full (simulated)')); window.__notices.length=0; })()`);
await setText("Folder for letters", "Letters QA 2");
await sleep(1200);
const notes = await ev(`window.__notices.slice()`);
const unhandled = await ev(`window.__unhandled.slice()`);
rec("F5-save-error-notice", notes.some((n) => /could not be saved.*disk full/.test(n)) && unhandled.length === 0, `notices: ${JSON.stringify(notes)}; unhandled rejections: ${JSON.stringify(unhandled)}`);
await ev(`(()=>{ const p=app.plugins.plugins['mind-letter']; p.saveSettings=p.__orig; })()`);

// the command still works end to end
rmSync(join(vault, "Letters QA 2"), { recursive: true, force: true });
await ev(`app.commands.executeCommandById('mind-letter:write-letter')`);
await sleep(3000);
rec("F5-command", existsSync(join(vault, "Letters QA 2")), `command wrote into the configured folder: ${existsSync(join(vault, "Letters QA 2"))}`);

writeFileSync(join(out, "RESULTS.json"), JSON.stringify(results, null, 2));
writeFileSync(join(out, "RESULTS.md"), "# QA 0.1.3 (isolated Obsidian, synthetic vault)\n\n" + results.map((r) => `- ${r.ok ? "PASS" : "FAIL"} ${r.id}: ${r.detail}`).join("\n") + "\n");
console.log(`${results.filter((r) => r.ok).length}/${results.length} passed`);
c.close();
process.exit(0);
