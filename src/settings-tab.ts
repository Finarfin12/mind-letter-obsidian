import { PluginSettingTab, Notice, Setting, type App } from "obsidian";
import {
	API_DEFAULT_BASE,
	CLI_SPECS,
	LOCAL_DEFAULT_BASE,
	createProvider,
	discoverModels,
	discoveryTarget,
	providerSlot,
	type ApiKind,
	type CliTool,
	type DiscoveryResult,
	type LocalKind,
	type ProviderMode,
} from "@mind-letter/ai";
import type MindLetterPlugin from "./main";
import { ApproveModal } from "./approve-modal";
import { buildProviderDeps } from "./ai-glue";
import type { LanguageSetting } from "./settings";
import { runAsync } from "./run-async";
import { resolveVisible, type SettingGroupDef, type SettingItemDef } from "./settingDefinitions";

const CLI_NAMES: Record<CliTool, string> = { claude: "Claude Code", codex: "Codex", gemini: "Gemini CLI", agy: "Antigravity (agy)" };
const LOCAL_NAMES: Record<LocalKind, string> = { ollama: "Ollama", lmstudio: "LM Studio" };
const API_NAMES: Record<ApiKind, string> = { openai: "OpenAI", anthropic: "Anthropic", gemini: "Google Gemini" };

export class MindLetterSettingTab extends PluginSettingTab {
	private result: DiscoveryResult | null = null;
	private checking = false;

	constructor(app: App, private readonly plugin: MindLetterPlugin) {
		super(app, plugin);
	}

	/** Run an async handler from a callback that must return void; a failure becomes a Notice instead of an unhandled rejection. */
	private run(fn: () => Promise<void>): void {
		runAsync(fn, e => new Notice(this.plugin.t("notice.saveFailed", { error: e instanceof Error ? e.message : "unknown" })));
	}

	/** Declarative settings (Obsidian 1.13+ lists them in its settings search). display() renders the same groups on older versions. */
	getSettingDefinitions(): SettingGroupDef[] {
		const t = this.plugin.t;
		const s = this.plugin.settings;
		const ai = s.ai;
		const save = (): Promise<void> => this.plugin.saveSettings();
		const redraw = (): void => this.display();
		const item = (id: string, name: string, render: SettingItemDef["render"], extra: Partial<SettingItemDef> = {}): SettingItemDef => ({ id, name, render, ...extra });
		const isCli = (): boolean => ai.provider === "cli";
		const isLocal = (): boolean => ai.provider === "local";
		const isApi = (): boolean => ai.provider === "api";
		const aiOn = (): boolean => ai.provider !== "off";
		const resetModel = async (): Promise<void> => {
			ai.model = "";
			this.result = null;
			await save();
			redraw();
		};

		const general: SettingGroupDef = {
			type: "group",
			id: "general",
			heading: t("set.general"),
			items: [
				item("language", t("set.language"), st =>
					st.addDropdown(d =>
						d
							.addOption("auto", t("set.language.auto"))
							.addOption("id", "Bahasa Indonesia")
							.addOption("en", "English")
							.setValue(s.language)
							.onChange(v => this.run(async () => {
								s.language = v as LanguageSetting;
								await save();
							})),
					),
				),
				item("folder", t("set.folder"), st => st.addText(x =>
					x.setValue(s.letterFolder).onChange(v => this.run(async () => {
						s.letterFolder = v.trim().replace(/^\/+|\/+$/g, "") || "Mind Letter";
						await save();
					})),
				), { desc: t("set.folder.desc") }),
				item("excluded", t("set.excluded"), st => st.addTextArea(x =>
					x.setValue(s.excludedFolders.join("\n")).onChange(v => this.run(async () => {
						s.excludedFolders = v.split(/\r?\n/).map(l => l.trim().replace(/^\/+|\/+$/g, "")).filter(Boolean);
						await save();
					})),
				), { desc: t("set.excluded.desc") }),
				item("auto", t("set.auto"), st => st.addToggle(x =>
					x.setValue(s.autoWeekly).onChange(v => this.run(async () => {
						s.autoWeekly = v;
						await save();
						redraw();
					})),
				), { desc: t("set.auto.desc") }),
				item("weekday", t("set.weekday"), st => st.addDropdown(d => {
					this.plugin.weekdayNames().forEach((name, i) => {
						d.addOption(String(i), name);
					});
					d.setValue(String(s.weekday)).onChange(v => this.run(async () => {
						s.weekday = Number(v);
						await save();
					}));
				}), { visible: () => s.autoWeekly }),
				item("hour", t("set.hour"), st => st.addSlider(x =>
					x.setLimits(0, 23, 1).setValue(s.hour).setDynamicTooltip().onChange(v => this.run(async () => {
						s.hour = v;
						await save();
					})),
				), { visible: () => s.autoWeekly }),
				item("privacy", t("set.privacy"), () => {}, { desc: t("set.privacy.desc") }),
			],
		};

		const aiGroup: SettingGroupDef = {
			type: "group",
			id: "ai",
			heading: t("set.ai"),
			items: [
				item("ai-mode", t("set.ai.mode"), st =>
					st.addDropdown(d =>
						d
							.addOption("off", t("set.ai.off"))
							.addOption("cli", t("set.ai.cli"))
							.addOption("local", t("set.ai.local"))
							.addOption("api", t("set.ai.api"))
							.setValue(ai.provider)
							.onChange(v => this.run(async () => {
								ai.provider = v as ProviderMode;
								this.result = null;
								await save();
								redraw();
							})),
					), { desc: t("set.ai.help") }),
				item("ai-cli", t("set.ai.source"), st => st.addDropdown(d => {
					(Object.keys(CLI_NAMES) as CliTool[]).forEach(k => {
						d.addOption(k, CLI_NAMES[k]);
					});
					d.setValue(ai.cli).onChange(v => this.run(async () => {
						ai.cli = v as CliTool;
						await resetModel();
					}));
				}), { visible: isCli }),
				item("ai-cli-note", t("model.detectOnly"), () => {}, { visible: () => isCli() && !!CLI_SPECS[ai.cli].detectOnly, desc: CLI_SPECS[ai.cli].detectOnly ?? "" }),
				item("ai-local", t("set.ai.source"), st => st.addDropdown(d => {
					(Object.keys(LOCAL_NAMES) as LocalKind[]).forEach(k => {
						d.addOption(k, LOCAL_NAMES[k]);
					});
					d.setValue(ai.local).onChange(v => this.run(async () => {
						ai.local = v as LocalKind;
						await resetModel();
					}));
				}), { visible: isLocal }),
				item("ai-local-url", t("set.ai.url"), st => st.addText(x =>
					x.setPlaceholder(LOCAL_DEFAULT_BASE[ai.local]).setValue(ai.localUrl).onChange(v => this.run(async () => {
						ai.localUrl = v.trim();
						await save();
					})),
				), { visible: isLocal }),
				item("ai-api", t("set.ai.source"), st => st.addDropdown(d => {
					(Object.keys(API_NAMES) as ApiKind[]).forEach(k => {
						d.addOption(k, API_NAMES[k]);
					});
					d.setValue(ai.api).onChange(v => this.run(async () => {
						ai.api = v as ApiKind;
						await resetModel();
					}));
				}), { visible: isApi }),
				item("ai-api-url", t("set.ai.url"), st => st.addText(x =>
					x.setPlaceholder(API_DEFAULT_BASE[ai.api]).setValue(ai.apiUrl).onChange(v => this.run(async () => {
						ai.apiUrl = v.trim();
						await save();
					})),
				), { visible: isApi }),
				item("ai-key", t("set.ai.key"), st => st.addText(x => {
					x.inputEl.type = "password";
					x.setValue(ai.apiKey).onChange(v => this.run(async () => {
						ai.apiKey = v.trim();
						await save();
					}));
				}), { visible: isApi, desc: t("set.ai.key.warn") }),
				item("ai-check", t("set.ai.check"), st => st.addButton(b =>
					b.setButtonText(this.checking ? t("set.ai.checking") : t("set.ai.check")).setDisabled(this.checking).onClick(() => void this.check()),
				), { visible: aiOn, desc: this.statusText() }),
				item("ai-model", t("set.ai.model"), st => st.addDropdown(d => {
					const models = this.result?.models ?? [];
					const labels = this.result?.labels ?? {};
					d.addOption("", models.length > 0 ? t("model.default") : isApi() && ai.apiKey === "" ? t("model.placeholderKey") : t("model.placeholder"));
					if (ai.model && !models.includes(ai.model)) d.addOption(ai.model, t("model.saved", { name: ai.model }));
					for (const m of models) d.addOption(m, labels[m] ? `${labels[m]} (${m})` : m);
					d.setValue(ai.model).onChange(v => this.run(async () => {
						ai.model = v;
						await save();
					}));
				}), { visible: aiOn, desc: t("set.ai.model.desc") }),
				item("ai-approve", t("set.ai.approve"), st => {
					const approved = ai.approvedSlot !== "" && ai.approvedSlot === providerSlot(ai);
					st.setDesc(approved ? t("set.ai.approved") : t("set.ai.approve.desc"));
					st.addButton(b =>
						b.setButtonText(approved ? t("set.ai.revoke") : t("set.ai.approve.btn")).onClick(() => this.run(async () => {
							if (approved) ai.approvedSlot = "";
							else if (await this.askApproval()) ai.approvedSlot = providerSlot(ai);
							await save();
							redraw();
						})),
					);
				}, { visible: aiOn }),
			],
		};
		return [general, aiGroup];
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		for (const group of this.getSettingDefinitions()) {
			if (!resolveVisible(group.visible)) continue;
			if (group.heading) new Setting(containerEl).setName(group.heading).setHeading();
			for (const it of group.items) {
				if (!resolveVisible(it.visible)) continue;
				const st = new Setting(containerEl).setName(it.name);
				if (it.desc) st.setDesc(it.desc);
				it.render(st);
			}
		}
	}

	private statusText(): string {
		const t = this.plugin.t;
		const r = this.result;
		if (!r) return t("model.none");
		if (r.connected) {
			const ok = r.models.length > 0 ? t("model.ok", { n: r.models.length }) : t("model.ok0");
			return r.detectOnly ? `${ok} · ${t("model.detectOnly")}` : ok;
		}
		switch (r.status) {
			case "desktopOnly":
				return t("model.desktopOnly");
			case "needsKey":
				return t("model.needsKey");
			case "unauthorized":
				return t("model.unauthorized");
			case "error":
				return t("model.error");
			default:
				return t("model.unavailable");
		}
	}

	private async check(): Promise<void> {
		const ai = this.plugin.settings.ai;
		const target = discoveryTarget(ai);
		if (!target) return;
		this.checking = true;
		this.display();
		try {
			this.result = await discoverModels(target, buildProviderDeps());
		} finally {
			this.checking = false;
		}
		const name = this.providerName();
		const t = this.plugin.t;
		new Notice(this.result.connected ? t("notice.connected", { name, n: this.result.models.length }) : t("notice.notConnected", { name, reason: this.statusText() }));
		this.display();
	}

	private providerName(): string {
		const ai = this.plugin.settings.ai;
		return ai.provider === "cli" ? CLI_NAMES[ai.cli] : ai.provider === "local" ? LOCAL_NAMES[ai.local] : API_NAMES[ai.api];
	}

	private askApproval(): Promise<boolean> {
		const ai = this.plugin.settings.ai;
		const provider = createProvider(ai, buildProviderDeps());
		return new ApproveModal(this.app, this.plugin.t, {
			name: provider?.label ?? this.providerName(),
			cloud: provider ? provider.cloud : ai.provider === "api",
			cli: ai.provider === "cli",
			api: ai.provider === "api",
			maxChars: ai.maxContextChars,
		}).ask();
	}
}
