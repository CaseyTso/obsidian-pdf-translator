import type { LlmProfile, PdfTranslatorSettings } from "./types";

export const DEFAULT_LLM_PROMPT =
	"将以下文本准确翻译成简体中文。保留医学与科研术语的专业性；对于容易产生歧义的重要术语，可在译文后用括号保留英文原词。只输出译文，不添加解释。";

type ProfileResult = { ok: true; settings: PdfTranslatorSettings } | { ok: false; error: string };

/**
 * 真实 URL 谓词：trim 后先要求字面 http:// 或 https:// 前缀（大小写不敏感，
 * 与 new URL("HTTP://x") 解析为 http: 的语义一致），再继续用 new URL 解析
 * （try/catch）并校验 protocol 为 http: / https: 且 host 非空。
 * 为什么不能只依赖 new URL() 规范化结果（vitest node 环境验证）：
 * - new URL("https:api.example.com/v1") → "https://api.example.com/v1"（有 host）
 * - new URL("http:localhost:8080/v1") → "http://localhost:8080/v1"（有 host）
 * - new URL("https:/api.example.com/v1") → "https://api.example.com/v1"（有 host）
 * - new URL("http:/localhost:8080/v1") → "http://localhost:8080/v1"（有 host）
 * 以上四种缺斜杠的 malformed 输入会被 WHATWG 自动规范化为带 host 的合法 URL，
 * 仅凭 new URL + host 非空会被绕过，故必须先用字面前缀检查拒绝。
 * 其余边界仍由 new URL 保证：
 * - new URL("http://") / new URL("https://") 抛 TypeError（无 host）→ false
 * - new URL("ftp://x") 解析成功但 protocol 为 ftp: → false
 * - new URL("legacy.example/v1") 无 scheme → 抛 TypeError → false
 */
export function isValidHttpUrl(value: string): boolean {
	const input = value.trim();
	// 字面前缀检查：http:// 或 https://（大小写不敏感），四个斜杠缺一不可
	if (!/^https?:\/\//i.test(input)) return false;
	try {
		const url = new URL(input);
		return (url.protocol === "http:" || url.protocol === "https:") && url.host !== "";
	} catch {
		return false;
	}
}

export function generateProfileId(): string {
	const c = globalThis.crypto;
	if (c && typeof c.randomUUID === "function") {
		return c.randomUUID();
	}
	return `profile-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function migrateLegacyLlmConfig(settings: PdfTranslatorSettings, nowMs?: number): PdfTranslatorSettings {
	// 判别器：llmProfiles 字段显式存在（包括空数组 []）即视为已归一化的持久化 profile 状态，
	// 一律 no-op clone（保留 llmProfiles 与 activeLlmProfileId 原值，不建 profile、不改平面字段）。
	// 否则视为真正旧版设置（无 profile 状态字段），才按 legacy 迁移逻辑处理。
	if (settings.llmProfiles !== undefined) {
		return { ...settings, llmProfiles: [...settings.llmProfiles] };
	}
	const baseUrl = settings.llmBaseUrl.trim();
	const apiKey = settings.llmApiKey.trim();
	const model = settings.llmModel.trim();
	// 完整 = 三字段非空 且 baseUrl 为合法 http(s) URL（与 validateProfileInput 一致，绕过它建 profile）
	if (baseUrl && apiKey && model && isValidHttpUrl(baseUrl)) {
		const id = generateProfileId();
		const profile: LlmProfile = {
			id,
			name: "默认配置",
			baseUrl,
			apiKey,
			model,
			prompt: settings.llmPrompt.trim() || DEFAULT_LLM_PROMPT,
			lastUsedAt: nowMs ?? Date.now(),
		};
		return { ...settings, llmProfiles: [profile], activeLlmProfileId: id };
	}
	// 不完整：不建 profile，平面字段保留为草稿，activeLlmProfileId 保持原值
	return { ...settings, llmProfiles: [] };
}

export function validateProfileInput(
	input: { name: string; baseUrl: string; apiKey: string; model: string },
	existingNames: string[],
	excludeId?: string,
): string | null {
	// existingNames 由调用方构造：应排除 excludeId 对应配置档的名称（自身重名允许）
	const name = input.name.trim();
	if (!name) return "名称不能为空";
	if (existingNames.some((n) => n.trim() === name)) return "名称已存在";
	const baseUrl = input.baseUrl.trim();
	const apiKey = input.apiKey.trim();
	const model = input.model.trim();
	if (!baseUrl) return "Base URL 不能为空";
	if (!apiKey) return "API key 不能为空";
	if (!model) return "Model 不能为空";
	if (!isValidHttpUrl(baseUrl)) return "Base URL 必须以 http:// 或 https:// 开头";
	return null;
}

export function sortProfiles(profiles: LlmProfile[], activeId?: string): LlmProfile[] {
	return [...profiles].sort((a, b) => {
		const aActive = a.id === activeId ? 0 : 1;
		const bActive = b.id === activeId ? 0 : 1;
		if (aActive !== bActive) return aActive - bActive;
		const aZero = a.lastUsedAt === 0 ? 0 : 1;
		const bZero = b.lastUsedAt === 0 ? 0 : 1;
		if (aZero !== bZero) return bZero - aZero;
		if (a.lastUsedAt !== b.lastUsedAt) return b.lastUsedAt - a.lastUsedAt;
		const nameCmp = a.name.localeCompare(b.name);
		if (nameCmp !== 0) return nameCmp;
		return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
	});
}

export function createProfile(
	settings: PdfTranslatorSettings,
	input: { name: string; baseUrl: string; apiKey: string; model: string; prompt: string },
	nowMs?: number,
): ProfileResult {
	const profiles = settings.llmProfiles ?? [];
	const error = validateProfileInput(input, profiles.map((p) => p.name));
	if (error) return { ok: false, error };
	const id = generateProfileId();
	const profile: LlmProfile = {
		id,
		name: input.name.trim(),
		baseUrl: input.baseUrl.trim(),
		apiKey: input.apiKey.trim(),
		model: input.model.trim(),
		prompt: input.prompt.trim(),
		lastUsedAt: nowMs ?? Date.now(),
	};
	return {
		ok: true,
		settings: {
			...settings,
			llmProfiles: [...profiles, profile],
			activeLlmProfileId: id,
			llmApiKey: profile.apiKey,
			llmBaseUrl: profile.baseUrl,
			llmModel: profile.model,
			llmPrompt: profile.prompt,
		},
	};
}

export function updateProfile(
	settings: PdfTranslatorSettings,
	id: string,
	patch: Partial<{ name: string; baseUrl: string; apiKey: string; model: string; prompt: string }>,
): ProfileResult {
	const profiles = settings.llmProfiles ?? [];
	const profile = profiles.find((p) => p.id === id);
	if (!profile) return { ok: false, error: "配置档不存在" };
	const others = profiles.filter((p) => p.id !== id);
	const merged = {
		name: patch.name ?? profile.name,
		baseUrl: patch.baseUrl ?? profile.baseUrl,
		apiKey: patch.apiKey ?? profile.apiKey,
		model: patch.model ?? profile.model,
	};
	const error = validateProfileInput(merged, others.map((p) => p.name), id);
	if (error) return { ok: false, error };
	const updated: LlmProfile = {
		...profile,
		name: merged.name.trim(),
		baseUrl: merged.baseUrl.trim(),
		apiKey: merged.apiKey.trim(),
		model: merged.model.trim(),
		prompt: patch.prompt !== undefined ? patch.prompt.trim() : profile.prompt,
	};
	const isActive = id === settings.activeLlmProfileId;
	if (isActive) {
		// 编辑当前配置档必须原子同步平面字段（与 activateProfile 一致）：
		// translate() 实际读取的是平面字段，不同步会导致实际生效配置与配置档不一致。
		// 重命名（仅 patch.name）时同步为相同值，不损坏现有平面值。
		return {
			ok: true,
			settings: {
				...settings,
				llmProfiles: profiles.map((p) => (p.id === id ? updated : p)),
				llmApiKey: updated.apiKey,
				llmBaseUrl: updated.baseUrl,
				llmModel: updated.model,
				llmPrompt: updated.prompt,
			},
		};
	}
	return {
		ok: true,
		settings: { ...settings, llmProfiles: profiles.map((p) => (p.id === id ? updated : p)) },
	};
}

export function renameProfile(settings: PdfTranslatorSettings, id: string, newName: string): ProfileResult {
	return updateProfile(settings, id, { name: newName });
}

export function deleteProfile(settings: PdfTranslatorSettings, id: string): ProfileResult {
	if (id === settings.activeLlmProfileId) {
		return { ok: false, error: "当前启用配置档不可删除" };
	}
	return {
		ok: true,
		settings: { ...settings, llmProfiles: (settings.llmProfiles ?? []).filter((p) => p.id !== id) },
	};
}

/**
 * 是否存在可删除的配置档。删除保护只针对「删除目标 === 当前启用配置档」，
 * 与数量无关：自定义状态（active 为 null）下即使只剩 1 个配置档也可删除。
 * 供设置页顶部「删除」按钮的禁用条件使用，与删除弹窗内的逐项保护保持一致。
 */
export function hasDeletableProfile(
	profiles: LlmProfile[] | undefined,
	activeId: string | null | undefined,
): boolean {
	return (profiles ?? []).some((p) => p.id !== activeId);
}

export function activateProfile(settings: PdfTranslatorSettings, id: string, nowMs?: number): ProfileResult {
	const profiles = settings.llmProfiles ?? [];
	const profile = profiles.find((p) => p.id === id);
	if (!profile) return { ok: false, error: "配置档不存在" };
	const now = nowMs ?? Date.now();
	return {
		ok: true,
		settings: {
			...settings,
			llmApiKey: profile.apiKey,
			llmBaseUrl: profile.baseUrl,
			llmModel: profile.model,
			llmPrompt: profile.prompt,
			activeLlmProfileId: id,
			llmProfiles: profiles.map((p) => (p.id === id ? { ...p, lastUsedAt: now } : p)),
		},
	};
}

export function applyDraft(
	settings: PdfTranslatorSettings,
	draft: { baseUrl: string; apiKey: string; model: string; prompt: string },
): ProfileResult {
	const baseUrl = draft.baseUrl.trim();
	const apiKey = draft.apiKey.trim();
	const model = draft.model.trim();
	const prompt = draft.prompt.trim();
	if (!baseUrl) return { ok: false, error: "Base URL 不能为空" };
	if (!apiKey) return { ok: false, error: "API key 不能为空" };
	if (!model) return { ok: false, error: "Model 不能为空" };
	if (!isValidHttpUrl(baseUrl)) return { ok: false, error: "Base URL 必须以 http:// 或 https:// 开头" };
	return {
		ok: true,
		settings: {
			...settings,
			llmApiKey: apiKey,
			llmBaseUrl: baseUrl,
			llmModel: model,
			llmPrompt: prompt,
			activeLlmProfileId: null,
		},
	};
}

export function isCustomState(settings: PdfTranslatorSettings): boolean {
	// 契约：自定义状态 = 配置草稿已应用为实际 LLM 参数、但未覆盖或另存为任何配置档。
	// applyDraft 会校验三字段非空 + URL 合法，因此等价于：active 为 null 且
	// baseUrl/apiKey/model（trim 后）全非空 且 baseUrl 为合法 http(s) URL。prompt 不参与判定。
	if (settings.activeLlmProfileId != null) return false;
	const baseUrl = settings.llmBaseUrl.trim();
	const apiKey = settings.llmApiKey.trim();
	const model = settings.llmModel.trim();
	return Boolean(baseUrl && apiKey && model && isValidHttpUrl(baseUrl));
}

/**
 * 把设置页草稿映射为平面 LLM 字段（llmBaseUrl/llmApiKey/llmModel/llmPrompt），
 * 供 saveDraftAsProfile / saveDraftToActiveProfile / resolveDirtySwitch 消费。
 * 草稿字段名（baseUrl/apiKey/model/prompt）与平面字段名不同，直接 spread
 * { ...settings, ...draft } 不会覆盖平面字段，会导致保存/更新/「更新后切换」
 * 写入的是旧平面值而不是当前草稿。本函数是唯一正确的 staging 入口。
 * 不 trim：下游核心函数统一 trim；保持与 applyDraft 透传原始草稿一致的约定。
 */
export function stageDraft(
	settings: PdfTranslatorSettings,
	draft: { baseUrl: string; apiKey: string; model: string; prompt: string },
): PdfTranslatorSettings {
	return {
		...settings,
		llmBaseUrl: draft.baseUrl,
		llmApiKey: draft.apiKey,
		llmModel: draft.model,
		llmPrompt: draft.prompt,
	};
}

export function saveDraftAsProfile(settings: PdfTranslatorSettings, name: string, nowMs?: number): ProfileResult {
	const profiles = settings.llmProfiles ?? [];
	const error = validateProfileInput(
		{ name, baseUrl: settings.llmBaseUrl, apiKey: settings.llmApiKey, model: settings.llmModel },
		profiles.map((p) => p.name),
	);
	if (error) return { ok: false, error };
	const id = generateProfileId();
	const profile: LlmProfile = {
		id,
		name: name.trim(),
		baseUrl: settings.llmBaseUrl.trim(),
		apiKey: settings.llmApiKey.trim(),
		model: settings.llmModel.trim(),
		prompt: settings.llmPrompt.trim() || DEFAULT_LLM_PROMPT,
		lastUsedAt: nowMs ?? Date.now(),
	};
	return {
		ok: true,
		settings: {
			...settings,
			llmProfiles: [...profiles, profile],
			activeLlmProfileId: id,
			// 与 createProfile / activateProfile / updateProfile(active) 一致：
			// translate() 实际读取的是平面字段，激活 profile 必须原子同步规范化后的值。
			llmApiKey: profile.apiKey,
			llmBaseUrl: profile.baseUrl,
			llmModel: profile.model,
			llmPrompt: profile.prompt,
		},
	};
}

export function saveDraftToActiveProfile(settings: PdfTranslatorSettings): ProfileResult {
	const activeId = settings.activeLlmProfileId ?? null;
	const profiles = settings.llmProfiles ?? [];
	const profile = profiles.find((p) => p.id === activeId);
	if (!activeId || !profile) return { ok: false, error: "当前没有可更新的配置档" };
	const others = profiles.filter((p) => p.id !== activeId);
	const error = validateProfileInput(
		{ name: profile.name, baseUrl: settings.llmBaseUrl, apiKey: settings.llmApiKey, model: settings.llmModel },
		others.map((p) => p.name),
		activeId,
	);
	if (error) return { ok: false, error };
	const updated: LlmProfile = {
		...profile,
		baseUrl: settings.llmBaseUrl.trim(),
		apiKey: settings.llmApiKey.trim(),
		model: settings.llmModel.trim(),
		prompt: settings.llmPrompt.trim(),
	};
	return {
		ok: true,
		settings: { ...settings, llmProfiles: profiles.map((p) => (p.id === activeId ? updated : p)) },
	};
}

export function hasDirtyDraft(
	draft: { baseUrl: string; apiKey: string; model: string; prompt: string },
	baseline: { baseUrl: string; apiKey: string; model: string; prompt: string },
): boolean {
	return (
		draft.baseUrl.trim() !== baseline.baseUrl.trim() ||
		draft.apiKey.trim() !== baseline.apiKey.trim() ||
		draft.model.trim() !== baseline.model.trim() ||
		draft.prompt.trim() !== baseline.prompt.trim()
	);
}

export function resolveDirtySwitch(
	settings: PdfTranslatorSettings,
	targetProfileId: string,
	choice: "apply" | "discard" | "cancel",
	nowMs?: number,
): { ok: boolean; settings?: PdfTranslatorSettings; error?: string } {
	if (choice === "cancel") return { ok: true, settings };
	if (choice === "discard") return activateProfile(settings, targetProfileId, nowMs);
	const saved = saveDraftToActiveProfile(settings);
	if (!saved.ok) return { ok: false, error: saved.error };
	return activateProfile(saved.settings, targetProfileId, nowMs);
}
