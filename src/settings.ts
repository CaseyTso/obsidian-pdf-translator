import { App, Modal, Notice, PluginSettingTab, Setting } from "obsidian";
import type PdfTranslatorPlugin from "./main";
import {
	activateProfile,
	applyDraft,
	deleteProfile,
	hasDeletableProfile,
	hasDirtyDraft,
	isCustomState,
	renameProfile,
	resolveDirtySwitch,
	saveDraftAsProfile,
	saveDraftToActiveProfile,
	sortProfiles,
	stageDraft,
} from "./llmProfiles";
import { TARGET_LANGUAGES } from "./services";
import { testConnection } from "./services";
import type { ConnectionTestResult, LlmProfile } from "./types";

type LlmDraft = { baseUrl: string; apiKey: string; model: string; prompt: string };

export class PdfTranslatorSettingTab extends PluginSettingTab {
	private draft: LlmDraft;
	private baseline: LlmDraft;
	private apiKeyVisible = false;
	private connectionResult: ConnectionTestResult | null = null;
	private testing = false;
	constructor(
		app: App,
		private plugin: PdfTranslatorPlugin,
	) {
		super(app, plugin);
		this.draft = draftFromPlugin(plugin);
		this.baseline = { ...this.draft };
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("翻译服务")
			.setDesc("选择用于翻译的底层服务")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("google", "Google")
					.addOption("llm", "LLM")
					.setValue(this.plugin.settings.service)
					.onChange(async (value) => {
						if (await this.plugin.updateSettings({ service: value as "google" | "llm" })) this.display();
					}),
			);

		if (this.plugin.settings.service === "llm") {
			this.renderLlmSettings(containerEl);
		}

		new Setting(containerEl)
			.setName("目标语言")
			.setDesc("译文的目标语言")
			.addDropdown((dropdown) => {
				for (const language of TARGET_LANGUAGES) {
					dropdown.addOption(language.code, language.label);
				}
				dropdown.setValue(this.plugin.settings.targetLanguage);
				dropdown.onChange(async (value) => void this.plugin.updateSettings({ targetLanguage: value }));
			});

		new Setting(containerEl)
			.setName("弹窗字号")
			.setDesc("翻译结果弹窗的字体大小（像素）")
			.addText((text) => {
				text.inputEl.type = "number";
				text.inputEl.min = "10";
				text.inputEl.max = "32";
				text.setValue(String(this.plugin.settings.popupFontSize));
				text.onChange(async (value) => {
					const parsed = Number(value);
					await this.plugin.updateSettings({ popupFontSize: Number.isFinite(parsed) ? parsed : 14 });
				});
			});

		new Setting(containerEl)
			.setName("数据说明")
			.setDesc("选中文本会发送到你所选的翻译服务；API key 仅保存在本机 Obsidian 设置中，插件不提供自建服务器。");
	}

	private renderLlmSettings(containerEl: HTMLElement): void {
		const activeId = this.plugin.settings.activeLlmProfileId;
		const active = this.plugin.settings.llmProfiles?.find((profile) => profile.id === activeId);
		new Setting(containerEl)
			.setName("LLM 配置档")
			.setDesc(active ? "当前启用配置档置顶；其他配置档按最近使用排序。" : "自定义（未绑定已保存配置档）")
			.addDropdown((dropdown) => {
				dropdown.addOption("__custom__", "自定义");
				for (const profile of sortProfiles(this.plugin.settings.llmProfiles ?? [], activeId ?? undefined)) {
					dropdown.addOption(profile.id, profile.name);
				}
				dropdown.setValue(activeId ?? "__custom__");
				dropdown.onChange((id) => {
					if (id !== "__custom__" && id !== activeId) void this.switchProfile(id);
				});
			})
			.addButton((button) => button.setButtonText("新建").onClick(() => this.saveAsNewProfile()))
			.addButton((button) => {
				button.setButtonText("重命名").setDisabled(!active);
				button.onClick(() => active && this.renameActiveProfile(active));
			})
			.addButton((button) => {
				button.setButtonText("删除").setDisabled(!hasDeletableProfile(this.plugin.settings.llmProfiles, activeId));
				button.onClick(() => this.openDeleteProfileModal());
			});

		new Setting(containerEl)
			.setName("LLM API key")
			.setDesc("调用 LLM 服务所需的 API key")
			.addText((text) => {
				text.inputEl.type = this.apiKeyVisible ? "text" : "password";
				text.setPlaceholder("sk-…").setValue(this.draft.apiKey);
				text.onChange((value) => { this.draft.apiKey = value; });
			})
			.addExtraButton((button) => {
				button.setIcon(this.apiKeyVisible ? "eye-off" : "eye").setTooltip(this.apiKeyVisible ? "隐藏 API key" : "显示 API key");
				button.onClick(() => { this.apiKeyVisible = !this.apiKeyVisible; this.display(); });
			});

		this.addDraftText(containerEl, "LLM Base URL", "OpenAI 兼容接口的 Base URL", "https://api.openai.com/v1", "baseUrl");
		this.addDraftText(containerEl, "LLM 模型", "使用的模型名称，如 gpt-4o-mini", "gpt-4o-mini", "model");
		new Setting(containerEl)
			.setName("提示词")
			.setDesc("发送给 LLM 的翻译提示词（仅 LLM 服务生效）")
			.addTextArea((textArea) => textArea.setValue(this.draft.prompt).onChange((value) => { this.draft.prompt = value; }));

		const testSetting = new Setting(containerEl).setName("连接测试").setDesc("使用当前未保存草稿发送一次固定 Hello 测试；不会保存、应用或切换配置档。");
		testSetting.addButton((button) => {
			button.setButtonText(this.testing ? "测试中…" : "Test").setCta().setDisabled(this.testing);
			button.onClick(async () => {
				this.testing = true;
				this.display();
				this.connectionResult = await testConnection({ baseUrl: this.draft.baseUrl, apiKey: this.draft.apiKey, model: this.draft.model });
				this.testing = false;
				this.display();
			});
		});
		if (this.connectionResult) {
			const result = this.connectionResult;
			new Setting(containerEl).setName(result.ok ? `连接成功（${result.elapsedMs} ms）` : `连接失败（${result.elapsedMs} ms）`).setDesc(result.ok ? result.response : result.error);
		}

		new Setting(containerEl)
			.setName("应用与保存")
			.setDesc(isCustomState(this.plugin.settings) ? "当前运行时状态：自定义。" : "应用草稿不会覆盖已保存配置档。")
			.addButton((button) => button.setButtonText("应用当前修改").setCta().onClick(() => this.applyDraft()))
			.addButton((button) => button.setButtonText("保存为新配置档").onClick(() => this.saveAsNewProfile()))
			.addButton((button) => {
				button.setButtonText("更新当前配置档").setDisabled(!active);
				button.onClick(() => this.updateActiveProfile());
			});
	}

	private addDraftText(containerEl: HTMLElement, name: string, desc: string, placeholder: string, field: "baseUrl" | "model"): void {
		new Setting(containerEl).setName(name).setDesc(desc).addText((text) => text.setPlaceholder(placeholder).setValue(this.draft[field]).onChange((value) => { this.draft[field] = value; }));
	}

	private async applyDraft(): Promise<void> {
		const result = applyDraft(this.plugin.settings, this.draft);
		if (!result.ok) return void new Notice(result.error);
		if (await this.plugin.saveSettings(result.settings)) {
			new Notice("已应用自定义 LLM 配置");
			this.resetDraftAndDisplay();
		}
	}

	private async updateActiveProfile(): Promise<void> {
		const staged = stageDraft(this.plugin.settings, this.draft);
		const result = saveDraftToActiveProfile(staged);
		if (!result.ok) return void new Notice(result.error);
		if (await this.plugin.saveSettings(result.settings)) {
			new Notice("当前配置档已更新");
			this.resetDraftAndDisplay();
		}
	}

	private saveAsNewProfile(): void {
		new ProfileNameModal(this.app, "保存为新配置档", "保存", async (name) => {
			const result = saveDraftAsProfile(stageDraft(this.plugin.settings, this.draft), name);
			if (!result.ok) {
				new Notice(result.error);
				return;
			}
			if (await this.plugin.saveSettings(result.settings)) {
				new Notice("新配置档已保存并启用");
				this.resetDraftAndDisplay();
			}
		}).open();
	}

	private renameActiveProfile(profile: LlmProfile): void {
		new ProfileNameModal(this.app, "重命名配置档", "重命名", async (name) => {
			const result = renameProfile(this.plugin.settings, profile.id, name);
			if (!result.ok) {
				new Notice(result.error);
				return;
			}
			if (await this.plugin.saveSettings(result.settings)) this.resetDraftAndDisplay();
		}, profile.name).open();
	}

	private openDeleteProfileModal(): void {
		new DeleteProfileModal(this.app, this.plugin.settings.llmProfiles ?? [], this.plugin.settings.activeLlmProfileId ?? null, async (profile) => {
			const result = deleteProfile(this.plugin.settings, profile.id);
			if (!result.ok) {
				new Notice(result.error);
				return;
			}
			if (await this.plugin.saveSettings(result.settings)) {
				new Notice(`已删除配置档「${profile.name}」`);
				this.resetDraftAndDisplay();
			}
		}).open();
	}

	private switchProfile(targetId: string): void {
		if (!hasDirtyDraft(this.draft, this.baseline)) {
			void this.persistProfileSwitch(targetId, "discard");
			return;
		}
		new DirtySwitchModal(this.app, async (choice) => {
			if (choice !== "cancel") await this.persistProfileSwitch(targetId, choice);
			else this.display();
		}).open();
	}

	private async persistProfileSwitch(targetId: string, choice: "apply" | "discard"): Promise<void> {
		const staged = stageDraft(this.plugin.settings, this.draft);
		const result = choice === "apply"
			? resolveDirtySwitch(staged, targetId, "apply")
			: activateProfile(this.plugin.settings, targetId);
		if (!result.ok || !result.settings) {
			new Notice(("error" in result ? result.error : undefined) ?? "无法切换配置档");
			return;
		}
		if (await this.plugin.saveSettings(result.settings)) this.resetDraftAndDisplay();
	}

	private resetDraftAndDisplay(): void {
		this.draft = draftFromPlugin(this.plugin);
		this.baseline = { ...this.draft };
		this.apiKeyVisible = false;
		this.connectionResult = null;
		this.display();
	}
}

class ProfileNameModal extends Modal {
	private value: string;
	constructor(app: App, private title: string, private action: string, private onSubmit: (name: string) => Promise<void> | void, initialValue = "") {
		super(app);
		this.value = initialValue;
	}
	onOpen(): void {
		this.contentEl.createEl("h2", { text: this.title });
		const input = this.contentEl.createEl("input", { type: "text", value: this.value, attr: { "aria-label": "配置档名称" } });
		input.focus();
		input.addEventListener("input", () => { this.value = input.value; });
		new Setting(this.contentEl).addButton((button) => button.setButtonText(this.action).setCta().onClick(async () => { await this.onSubmit(this.value); this.close(); }));
	}
}

class ConfirmModal extends Modal {
	constructor(app: App, private message: string, private action: string, private onConfirm: () => Promise<void> | void) { super(app); }
	onOpen(): void {
		this.contentEl.createEl("p", { text: this.message });
		new Setting(this.contentEl)
			.addButton((button) => button.setButtonText("取消").onClick(() => this.close()))
			.addButton((button) => button.setButtonText(this.action).setWarning().onClick(async () => { await this.onConfirm(); this.close(); }));
	}
}

class DeleteProfileModal extends Modal {
	constructor(
		app: App,
		private profiles: LlmProfile[],
		private activeId: string | null,
		private onDelete: (profile: LlmProfile) => Promise<void> | void,
	) {
		super(app);
	}
	onOpen(): void {
		this.contentEl.createEl("h2", { text: "删除配置档" });
		this.contentEl.createEl("p", { text: "当前启用配置档不可删除。" });
		for (const profile of sortProfiles(this.profiles, this.activeId ?? undefined)) {
			const isActive = profile.id === this.activeId;
			new Setting(this.contentEl)
				.setName(profile.name)
				.setDesc(isActive ? "当前启用配置档，不可删除" : "")
				.addButton((button) => button.setButtonText("删除").setWarning().setDisabled(isActive).onClick(async () => {
					if (isActive) return;
					new ConfirmModal(this.app, `删除配置档「${profile.name}」？`, "删除", async () => {
						await this.onDelete(profile);
						this.close();
					}).open();
				}));
		}
	}
}

class DirtySwitchModal extends Modal {
	constructor(app: App, private onChoose: (choice: "apply" | "discard" | "cancel") => Promise<void> | void) { super(app); }
	onOpen(): void {
		this.contentEl.createEl("h2", { text: "切换配置档" });
		this.contentEl.createEl("p", { text: "当前草稿尚未保存。请选择如何继续。" });
		new Setting(this.contentEl)
			.addButton((button) => button.setButtonText("更新当前后切换").setCta().onClick(async () => { await this.onChoose("apply"); this.close(); }))
			.addButton((button) => button.setButtonText("放弃修改后切换").onClick(async () => { await this.onChoose("discard"); this.close(); }))
			.addButton((button) => button.setButtonText("取消").onClick(async () => { await this.onChoose("cancel"); this.close(); }));
	}
}

function draftFromPlugin(plugin: PdfTranslatorPlugin): LlmDraft {
	return {
		baseUrl: plugin.settings.llmBaseUrl,
		apiKey: plugin.settings.llmApiKey,
		model: plugin.settings.llmModel,
		prompt: plugin.settings.llmPrompt,
	};
}
