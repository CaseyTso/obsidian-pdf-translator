export type TranslationServiceKind = "google" | "llm";

export interface PdfTranslatorSettings {
	service: TranslationServiceKind;
	llmApiKey: string;
	llmBaseUrl: string;
	llmModel: string;
	targetLanguage: string;
	popupFontSize: number;
	llmPrompt: string;
	llmProfiles?: LlmProfile[];
	activeLlmProfileId?: string | null;
}

export interface LlmProfile {
	id: string; // 稳定内部 id，创建时生成一次，此后不变
	name: string; // 唯一、已 trim
	baseUrl: string; // 已 trim
	apiKey: string; // 已 trim
	model: string; // 已 trim
	prompt: string; // 已 trim（可为默认提示词）
	lastUsedAt: number; // epoch ms；0 = 从未使用
}

export interface LlmConnectionDraft {
	baseUrl: string;
	apiKey: string;
	model: string;
}

export type ConnectionTestResult =
	| { ok: true; elapsedMs: number; response: string }
	| { ok: false; elapsedMs: number; error: string };

export interface PdfTextSelection {
	text: string;
	rect: DOMRect;
	pdfBounds: DOMRect;
}

export interface TranslationResult {
	translatedText: string;
	service: TranslationServiceKind;
	elapsedMs: number;
}
