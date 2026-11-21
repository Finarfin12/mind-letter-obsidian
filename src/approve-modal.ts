import { Modal, type App } from "obsidian";
import type { TFn } from "./i18n";

export interface ApproveInfo {
	name: string;
	cloud: boolean;
	cli: boolean;
	api: boolean;
	maxChars: number;
}

/** Asks once per provider before any text is sent to it. Resolves true only on "Approve". */
export class ApproveModal extends Modal {
	private result = false;
	private resolve: (ok: boolean) => void = () => {};

	constructor(app: App, private readonly t: TFn, private readonly info: ApproveInfo) {
		super(app);
	}

	ask(): Promise<boolean> {
		return new Promise<boolean>(resolve => {
			this.resolve = resolve;
			this.open();
		});
	}

	onOpen(): void {
		const { contentEl, titleEl } = this;
		titleEl.setText(this.t("approve.title"));
		const vars = { name: this.info.name, n: this.info.maxChars };
		contentEl.createEl("p", { text: this.info.cloud ? this.t("approve.cloud", vars) : this.t("approve.local", vars) });
		if (this.info.cli) contentEl.createEl("p", { text: this.t("approve.cli") });
		if (this.info.api) contentEl.createEl("p", { text: this.t("approve.api") });
		contentEl.createEl("p", { text: this.t("approve.rule") });
		const row = contentEl.createDiv({ cls: "modal-button-container" });
		const ok = row.createEl("button", { text: this.t("approve.agree"), cls: "mod-cta" });
		ok.addEventListener("click", () => {
			this.result = true;
			this.close();
		});
		const no = row.createEl("button", { text: this.t("approve.cancel") });
		no.addEventListener("click", () => this.close());
	}

	onClose(): void {
		this.contentEl.empty();
		this.resolve(this.result);
	}
}
