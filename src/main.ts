import { Notice, Plugin } from "obsidian";
import { PdfSelectionReader } from "./pdfSelection";
import { TranslationPopup } from "./translationPopup";
import { DEFAULT_LLM_PROMPT, GOOGLE_TIMEOUT_MS, LLM_TIMEOUT_MS, mapError, translate } from "./services";
import { isValidSelection, MAX_SELECTION_CHARS } from "./normalize";
import { PdfTranslatorSettingTab } from "./settings";
import { migrateLegacyLlmConfig } from "./llmProfiles";
import type { PdfTextSelection, PdfTranslatorSettings } from "./types";

const DEFAULT_SETTINGS: PdfTranslatorSettings = {
	service: "google",
	llmApiKey: "",
	llmBaseUrl: "",
	llmModel: "",
	targetLanguage: "zh-CN",
	popupFontSize: 14,
	llmPrompt: DEFAULT_LLM_PROMPT,
};

export default class PdfTranslatorPlugin extends Plugin {
	settings: PdfTranslatorSettings;
	private selectionReader: PdfSelectionReader;
	private popup: TranslationPopup;
	private selectionTimer: number | undefined;
	private requestSeq = 0;
	private lastSelection: PdfTextSelection | undefined;
	private lastKey = "";
	private isPointerSelecting = false;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.selectionReader = new PdfSelectionReader(this.app);
		this.popup = new TranslationPopup({
			fontSize: this.settings.popupFontSize,
			onRetry: () => void this.retryLastSelection(),
		});
		this.addSettingTab(new PdfTranslatorSettingTab(this.app, this));
		this.registerSelectionEvents();
	}

	onunload(): void {
		this.requestSeq++;
		window.clearTimeout(this.selectionTimer);
		this.popup?.destroy();
	}

	// —— 事件 ——
	private registerSelectionEvents(): void {
		this.registerDomEvent(activeDocument, "pointerdown", (e) => this.handlePointerDown(e), true);
		this.registerDomEvent(activeDocument, "selectionchange", () => this.handleSelectionChange());
		this.registerDomEvent(activeDocument, "mouseup", () => this.finishPointerSelection());
		this.registerDomEvent(activeDocument, "keyup", () => this.scheduleTranslation());
		this.registerDomEvent(activeDocument, "keydown", (e) => {
			if (e.key === "Escape") this.hidePopup();
		});
		this.registerDomEvent(window, "resize", () => this.popup.reposition(this.selectionReader.getActivePdfBounds()));
	}

	private handlePointerDown(event: MouseEvent): void {
		if (this.popup.containsTarget(event.target)) return;
		this.hidePopup();
		this.isPointerSelecting = true;
		window.clearTimeout(this.selectionTimer);
	}

	private handleSelectionChange(): void {
		if (this.isPointerSelecting) return;
		this.scheduleTranslation();
	}

	private finishPointerSelection(): void {
		if (!this.isPointerSelecting) return;
		this.isPointerSelecting = false;
		this.scheduleTranslation();
	}

	private scheduleTranslation(): void {
		window.clearTimeout(this.selectionTimer);
		this.selectionTimer = window.setTimeout(() => void this.translateCurrentSelection(), 350);
	}

	// —— 翻译编排 ——
	private async translateCurrentSelection(): Promise<void> {
		const selection = this.selectionReader.readSelection();
		if (!selection) return;
		if (!isValidSelection(selection.text)) {
			if (selection.text.length > MAX_SELECTION_CHARS) {
				this.popup.showError(`选中文本过长（>${MAX_SELECTION_CHARS} 字符）`, selection);
			}
			return;
		}
		await this.runTranslation(selection, false);
	}

	private async retryLastSelection(): Promise<void> {
		if (!this.lastSelection) {
			new Notice("没有可重翻的选中文本");
			return;
		}
		await this.runTranslation(this.lastSelection, true);
	}

	private async runTranslation(selection: PdfTextSelection, force: boolean): Promise<void> {
		const key = `${selection.text}|${Math.round(selection.rect.left)}|${Math.round(selection.rect.top)}`;
		if (!force && key === this.lastKey) return;
		this.lastKey = key;
		this.lastSelection = selection;

		const seq = ++this.requestSeq;
		this.popup.showLoading(selection);

		const timeoutMs = this.settings.service === "google" ? GOOGLE_TIMEOUT_MS : LLM_TIMEOUT_MS;
		try {
			const result = await withTimeout(translate(selection.text, this.settings), timeoutMs);
			if (seq !== this.requestSeq) return; // 旧请求，丢弃
			this.popup.showResult(result.translatedText, selection);
		} catch (error) {
			if (seq !== this.requestSeq) return;
			console.error("PDF Translator error:", error);
			this.popup.showError(mapError(error), selection);
		}
	}

	private hidePopup(): void {
		this.requestSeq++; // 使在途请求失效
		this.popup.hide();
		this.lastKey = "";
	}

	private async loadSettings(): Promise<void> {
		const legacySettings = Object.assign({}, DEFAULT_SETTINGS, (await this.loadData()) ?? {});
		this.settings = legacySettings;
		const migrated = migrateLegacyLlmConfig(legacySettings);
		if (!settingsEqual(legacySettings, migrated)) {
			await this.saveSettings(migrated);
		}
	}

	/**
	 * Atomically replace persisted settings. Callers must pass a fresh object rather
	 * than mutating `settings` before saving, so a rejected save can restore the
	 * real pre-save runtime state.
	 */
	async saveSettings(next: PdfTranslatorSettings = this.settings): Promise<boolean> {
		const previous = this.settings;
		this.settings = next;
		try {
			await this.saveData(next);
			return true;
		} catch {
			this.settings = previous;
			new Notice("设置保存失败，已恢复之前的配置");
			return false;
		}
	}

	async updateSettings(patch: Partial<PdfTranslatorSettings>): Promise<boolean> {
		return this.saveSettings({ ...this.settings, ...patch });
	}
}

function settingsEqual(a: PdfTranslatorSettings, b: PdfTranslatorSettings): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timer = window.setTimeout(() => reject(new DOMException("Timeout", "AbortError")), ms);
		promise.then(
			(v) => { window.clearTimeout(timer); resolve(v); },
			(e) => { window.clearTimeout(timer); reject(e); },
		);
	});
}
