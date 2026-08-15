import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ notices: [] as string[] }));

vi.mock("obsidian", () => {
	class Plugin {
		app: unknown;
		constructor(...args: unknown[]) {
			this.app = args[0];
		}
		addSettingTab(): void {}
		registerDomEvent(): void {}
	}
	class Notice {
		constructor(message: string) {
			mocks.notices.push(message);
		}
	}
	class PluginSettingTab {}
	class Setting {}
	class Modal {}
	return { Plugin, Notice, PluginSettingTab, Setting, Modal };
});

import PdfTranslatorPlugin from "../src/main";
import type { PdfTranslatorSettings } from "../src/types";

function legacySettings(): PdfTranslatorSettings {
	return {
		service: "llm",
		llmBaseUrl: "https://api.example.com/v1",
		llmApiKey: "test-key",
		llmModel: "test-model",
		llmPrompt: "test-prompt",
		targetLanguage: "zh-CN",
		popupFontSize: 14,
	};
}

describe("PdfTranslatorPlugin settings persistence", () => {
	it("首次载入完整 legacy 配置：迁移一次、持久化；模拟重启后不重复创建 profile", async () => {
		const stored = legacySettings();
		const first = new PdfTranslatorPlugin({} as never, {} as never) as any;
		first.loadData = vi.fn(async () => stored);
		first.saveData = vi.fn(async (value) => { Object.assign(stored, value); });

		await first.loadSettings();
		expect(first.saveData).toHaveBeenCalledTimes(1);
		expect(first.settings.llmProfiles).toHaveLength(1);
		expect(first.settings.activeLlmProfileId).toBe(first.settings.llmProfiles![0].id);

		const restarted = new PdfTranslatorPlugin({} as never, {} as never) as any;
		restarted.loadData = vi.fn(async () => stored);
		restarted.saveData = vi.fn();
		await restarted.loadSettings();
		expect(restarted.settings.llmProfiles).toHaveLength(1);
		expect(restarted.settings.activeLlmProfileId).toBe(first.settings.activeLlmProfileId);
		expect(restarted.saveData).not.toHaveBeenCalled();
	});

	it("saveData 失败会恢复内存并显示 Notice", async () => {
		mocks.notices.length = 0;
		const plugin = new PdfTranslatorPlugin({} as never, {} as never) as any;
		const previous: PdfTranslatorSettings = { ...legacySettings(), llmProfiles: [], activeLlmProfileId: null };
		plugin.settings = previous;
		plugin.saveData = vi.fn(async () => { throw new Error("disk full"); });

		const next = { ...previous, targetLanguage: "ja" };
		expect(await plugin.saveSettings(next)).toBe(false);
		expect(plugin.settings).toBe(previous);
		expect(mocks.notices).toContain("设置保存失败，已恢复之前的配置");
	});

	it("立即保存的全局字段经 updateSettings 写入，而不影响 LLM 配置档", async () => {
		const plugin = new PdfTranslatorPlugin({} as never, {} as never) as any;
		const profile = { id: "p1", name: "默认", baseUrl: "https://api.example.com/v1", apiKey: "test-key", model: "test-model", prompt: "p", lastUsedAt: 1 };
		plugin.settings = { ...legacySettings(), llmProfiles: [profile], activeLlmProfileId: "p1" };
		plugin.saveData = vi.fn(async () => {});

		expect(await plugin.updateSettings({ targetLanguage: "ja", popupFontSize: 16 })).toBe(true);
		expect(plugin.settings.targetLanguage).toBe("ja");
		expect(plugin.settings.popupFontSize).toBe(16);
		expect(plugin.settings.llmProfiles).toEqual([profile]);
		expect(plugin.settings.activeLlmProfileId).toBe("p1");
	});
});
