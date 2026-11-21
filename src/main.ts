import { Notice, Plugin, TFile, getLanguage } from "obsidian";
import type { Lang } from "@mind-letter/core";
import { mergeSettings, type MindLetterSettings } from "./settings";
import { makeT, type TFn } from "./i18n";
import { MindLetterSettingTab } from "./settings-tab";
import { adapterPort, readVaultNotes } from "./vault-source";
import { generateLetter, runWarmup } from "./generate";
import { loadMemory } from "./memory-store";
import { isWeeklyDue } from "./scheduler";
import { buildProviderDeps } from "./ai-glue";
import { runAsync } from "./run-async";

const CHECK_EVERY_MS = 30 * 60 * 1000;

export default class MindLetterPlugin extends Plugin {
	settings: MindLetterSettings = mergeSettings(null);
	t: TFn = makeT("en");
	private busy = false;

	async onload(): Promise<void> {
		this.settings = mergeSettings(await this.loadData());
		this.refreshLanguage();

		this.addSettingTab(new MindLetterSettingTab(this.app, this));
		this.addRibbonIcon("mail", this.t("ribbon"), () => this.run(() => this.writeLetter(false)));
		this.addCommand({ id: "write-letter", name: this.t("cmd.generate"), callback: () => this.run(() => this.writeLetter(false)) });
		this.addCommand({ id: "open-latest", name: this.t("cmd.open"), callback: () => this.run(() => this.openLatest()) });
		this.addCommand({ id: "warmup", name: this.t("cmd.warmup"), callback: () => this.run(() => this.warmup()) });

		// The weekly timer only exists while "write a letter every week" is on; with it off the plugin never writes by itself.
		this.registerInterval(window.setInterval(() => this.run(() => this.maybeWriteWeekly()), CHECK_EVERY_MS));
		this.app.workspace.onLayoutReady(() => this.run(() => this.maybeWriteWeekly()));
	}

	/** Start async work from a void callback; a failure becomes a Notice. */
	private run(fn: () => Promise<void>): void {
		runAsync(fn, e => new Notice(this.t("notice.failed", { error: e instanceof Error ? e.message : "unknown" })));
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	private refreshLanguage(): void {
		const lang: Lang = getLanguage().toLowerCase().startsWith("id") ? "id" : "en";
		this.t = makeT(lang);
	}

	weekdayNames(): string[] {
		const fmt = new Intl.DateTimeFormat(getLanguage() || "en", { weekday: "long" });
		// 2023-01-01 was a Sunday
		return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2023, 0, 1 + i)));
	}

	private async maybeWriteWeekly(): Promise<void> {
		if (!this.settings.autoWeekly || this.busy) return;
		const loaded = await loadMemory(adapterPort(this.app), this.settings.letterFolder);
		const due = isWeeklyDue({
			enabled: this.settings.autoWeekly,
			now: Date.now(),
			weekday: this.settings.weekday,
			hour: this.settings.hour,
			lastWeek: loaded.meta.lastWeek,
		});
		if (due) await this.writeLetter(true);
	}

	private async writeLetter(scheduled: boolean): Promise<void> {
		if (this.busy) return;
		this.busy = true;
		const t = this.t;
		try {
			if (!scheduled) new Notice(t("notice.writing"));
			const now = Date.now();
			const result = await generateLetter({
				port: adapterPort(this.app),
				readNotes: () => readVaultNotes(this.app, now),
				settings: this.settings,
				ai: this.settings.ai.provider === "off" ? null : buildProviderDeps(),
				version: this.manifest.version,
				now,
			});
			if (scheduled) new Notice(t("notice.scheduled"));
			else if (result.ai?.status === "ok") new Notice(t("notice.doneAi", { path: result.path, n: result.ai.accepted.length }));
			else if (result.ai?.status === "not-approved") new Notice(t("notice.aiNotApproved"));
			else if (result.ai && result.ai.status !== "off") new Notice(t("notice.aiFallback", { reason: result.ai.detail ?? result.ai.status }));
			else new Notice(t("notice.done", { path: result.path }));
			if (!scheduled) await this.open(result.path);
		} catch (e) {
			new Notice(t("notice.failed", { error: e instanceof Error ? e.message : "unknown" }));
		} finally {
			this.busy = false;
		}
	}

	private async warmup(): Promise<void> {
		try {
			const now = Date.now();
			const r = await runWarmup({ port: adapterPort(this.app), readNotes: () => readVaultNotes(this.app, now), settings: this.settings, now });
			new Notice(this.t("notice.warmupDone", { weeks: r.weeks, claims: r.claims }));
		} catch (e) {
			new Notice(this.t("notice.failed", { error: e instanceof Error ? e.message : "unknown" }));
		}
	}

	private async openLatest(): Promise<void> {
		const prefix = `${this.settings.letterFolder}/`;
		const letters = this.app.vault
			.getMarkdownFiles()
			.filter(f => f.path.startsWith(prefix) && /^\d{4}-W\d{2}/.test(f.name))
			.sort((a, b) => b.name.localeCompare(a.name));
		const latest = letters[0];
		if (!latest) {
			new Notice(this.t("notice.noLetter"));
			return;
		}
		await this.app.workspace.getLeaf(false).openFile(latest);
	}

	private async open(path: string): Promise<void> {
		const f = this.app.vault.getAbstractFileByPath(path);
		if (f instanceof TFile) await this.app.workspace.getLeaf(false).openFile(f);
	}
}

