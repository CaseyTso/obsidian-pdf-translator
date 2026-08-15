import { requestUrl } from "obsidian";
import type { ConnectionTestResult, LlmConnectionDraft, PdfTranslatorSettings, TranslationResult } from "../types";
import { DEFAULT_LLM_PROMPT } from "../llmProfiles";
import { buildGoogleUrl, parseGoogleResponse } from "./google";
import { buildChatUrl, cleanModelOutput, mapHttpError } from "./llm";

export { DEFAULT_LLM_PROMPT } from "../llmProfiles";

export const TARGET_LANGUAGES: Array<{ code: string; label: string }> = [
	{ code: "zh-CN", label: "简体中文" },
	{ code: "en", label: "English" },
	{ code: "ja", label: "日本語" },
	{ code: "de", label: "Deutsch" },
	{ code: "fr", label: "Français" },
];

export const GOOGLE_TIMEOUT_MS = 15000;
export const LLM_TIMEOUT_MS = 60000;
export const LLM_TEST_TIMEOUT_MS = 15000;

export function targetLabel(code: string): string {
	return TARGET_LANGUAGES.find((l) => l.code === code)?.label ?? code;
}

export async function translate(
	text: string,
	settings: PdfTranslatorSettings,
): Promise<TranslationResult> {
	const startedAt = performance.now();
	if (settings.service === "google") {
		const url = buildGoogleUrl(settings.targetLanguage, text);
		const response = await requestUrl({ url, method: "GET", throw: false });
		if (response.status !== 200) {
			throw new Error(mapHttpError(response.status));
		}
		const parsed = parseGoogleResponse(response.json);
		if (!parsed) {
			throw new Error("Google 返回空结果");
		}
		return { translatedText: parsed, service: "google", elapsedMs: Math.round(performance.now() - startedAt) };
	}

	// LLM 分支
	if (!settings.llmApiKey.trim()) throw new Error("请先在设置中填写 LLM API key");
	if (!settings.llmModel.trim()) throw new Error("请先在设置中填写 LLM 模型名");
	const response = await requestUrl({
		url: buildChatUrl(settings.llmBaseUrl),
		method: "POST",
		headers: { Authorization: `Bearer ${settings.llmApiKey.trim()}` },
		contentType: "application/json",
		body: JSON.stringify({
			model: settings.llmModel.trim(),
			stream: false,
			messages: [
				{ role: "system", content: buildSystemPrompt(settings) },
				{ role: "user", content: text },
			],
		}),
		throw: false,
	});
	if (response.status < 200 || response.status >= 300) {
		throw new Error(mapHttpError(response.status));
	}
	const data = response.json as {
		error?: { message?: string };
		choices?: Array<{ message?: { content?: string } }>;
	};
	if (data.error) throw new Error(data.error.message ?? "LLM 返回错误");
	const raw = data.choices?.[0]?.message?.content?.trim() ?? "";
	if (!raw) throw new Error("LLM 返回空结果");
	return { translatedText: cleanModelOutput(raw), service: "llm", elapsedMs: Math.round(performance.now() - startedAt) };
}

function buildSystemPrompt(settings: PdfTranslatorSettings): string {
	const prompt = settings.llmPrompt.trim() || DEFAULT_LLM_PROMPT;
	const target = targetLabel(settings.targetLanguage);
	if (target === "简体中文") return prompt; // 默认提示词已写死中文目标
	return `${prompt}\n\n目标语言：${target}`;
}

export function mapError(error: unknown): string {
	if (error instanceof DOMException && error.name === "AbortError") return "请求超时";
	if (error instanceof Error) return error.message;
	return "未知错误";
}

export async function testConnection(
	draft: LlmConnectionDraft,
	timeoutMs: number = LLM_TEST_TIMEOUT_MS,
): Promise<ConnectionTestResult> {
	const startedAt = performance.now();
	const apiKey = draft.apiKey.trim();
	try {
		const response = await withTestTimeout(
			requestUrl({
				url: buildChatUrl(draft.baseUrl),
				method: "POST",
				headers: { Authorization: `Bearer ${apiKey}` },
				contentType: "application/json",
				body: JSON.stringify({
					model: draft.model.trim(),
					stream: false,
					messages: [
						{
							role: "system",
							content:
								"You are a translator. Translate the user's message into simplified Chinese. Output only the translation.",
						},
						{ role: "user", content: "Hello" },
					],
				}),
				throw: false,
			}),
			timeoutMs,
		);
		const elapsedMs = Math.round(performance.now() - startedAt);
		if (response.status >= 200 && response.status < 300) {
			const data = response.json as {
				error?: { message?: string };
				choices?: Array<{ message?: { content?: string } }>;
			};
			if (data.error) {
				return { ok: false, elapsedMs, error: redactSecret(data.error.message ?? "LLM 返回错误", apiKey) };
			}
			const raw = data.choices?.[0]?.message?.content?.trim() ?? "";
			if (!raw) return { ok: false, elapsedMs, error: "LLM 返回空结果" };
			// 成功条件 = 清理后的展示响应非空：只含 <think>…</think> 的响应 raw 非空但清理后为空 → 失败
			const cleaned = cleanModelOutput(raw);
			if (!cleaned) return { ok: false, elapsedMs, error: "LLM 返回空结果" };
			// 先对完整 cleaned 脱敏（替换 key 及所有长度 ≥4 的前缀），再截断到 200 字符：
			// 若 key 回显在截断点之后，先截断会切断 key 导致无法整体匹配，泄漏 key 前缀。
			return { ok: true, elapsedMs, response: redactSecret(cleaned, apiKey).slice(0, 200) };
		}
		return { ok: false, elapsedMs, error: mapHttpError(response.status) };
	} catch (error) {
		const elapsedMs = Math.round(performance.now() - startedAt);
		if (error instanceof DOMException && error.name === "AbortError") {
			return { ok: false, elapsedMs, error: "请求超时" };
		}
		return { ok: false, elapsedMs, error: "连接失败：无法访问服务" };
	}
}

function redactSecret(text: string, secret: string): string {
	if (!secret) return text;
	// 按长度从长到短（最长 = key 全长，最短 = min(4, key 长度)）依次替换 key 的每个前缀：
	// 先替换长前缀可避免短前缀先替换而破坏更长的匹配；短于 4 的片段不替换——
	// 但 key 本身不足 4 字符时至少替换完整 key（「结果绝不含 key」是绝对规则）。
	let result = text;
	for (let len = secret.length; len >= Math.min(4, secret.length); len--) {
		result = result.split(secret.slice(0, len)).join("[REDACTED]");
	}
	return result;
}

function withTestTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timer = setTimeout(() => reject(new DOMException("Timeout", "AbortError")), ms);
		promise.then(
			(v) => {
				clearTimeout(timer);
				resolve(v);
			},
			(e) => {
				clearTimeout(timer);
				reject(e);
			},
		);
	});
}
