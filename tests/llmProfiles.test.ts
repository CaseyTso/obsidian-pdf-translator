import { describe, expect, it } from "vitest";
import {
	DEFAULT_LLM_PROMPT,
	activateProfile,
	applyDraft,
	createProfile,
	deleteProfile,
	generateProfileId,
	hasDeletableProfile,
	hasDirtyDraft,
	isCustomState,
	migrateLegacyLlmConfig,
	renameProfile,
	resolveDirtySwitch,
	saveDraftAsProfile,
	saveDraftToActiveProfile,
	sortProfiles,
	stageDraft,
	updateProfile,
	validateProfileInput,
} from "../src/llmProfiles";
import type { LlmProfile, PdfTranslatorSettings } from "../src/types";

function baseSettings(overrides: Partial<PdfTranslatorSettings> = {}): PdfTranslatorSettings {
	return {
		service: "llm",
		llmApiKey: "",
		llmBaseUrl: "",
		llmModel: "",
		targetLanguage: "zh-CN",
		popupFontSize: 14,
		llmPrompt: DEFAULT_LLM_PROMPT,
		...overrides,
	};
}

function makeProfile(id: string, name: string, overrides: Partial<LlmProfile> = {}): LlmProfile {
	return {
		id,
		name,
		baseUrl: `https://api.example.com/v1/${id}`,
		apiKey: `sk-${id}`,
		model: `model-${id}`,
		prompt: DEFAULT_LLM_PROMPT,
		lastUsedAt: 0,
		...overrides,
	};
}

function snapshot(value: unknown): unknown {
	return JSON.parse(JSON.stringify(value));
}

function expectNotMutated<T>(value: T, fn: (v: T) => unknown): void {
	const before = snapshot(value);
	fn(value);
	expect(snapshot(value)).toEqual(before);
}

describe("generateProfileId", () => {
	it("返回非空字符串", () => {
		expect(generateProfileId().length).toBeGreaterThan(0);
	});

	it("两次调用不重复", () => {
		expect(generateProfileId()).not.toBe(generateProfileId());
	});
});

describe("migrateLegacyLlmConfig", () => {
	it("llmProfiles 为 undefined 时归一为 []", () => {
		const result = migrateLegacyLlmConfig(baseSettings(), 1000);
		expect(result.llmProfiles).toEqual([]);
		expect(result).not.toBe(baseSettings());
	});

	it("完整 legacy 配置 → 自动建立并启用「默认配置」，平面字段保留原值", () => {
		const legacy = baseSettings({
			llmBaseUrl: "  https://api.example.com/v1  ",
			llmApiKey: "  sk-legacy  ",
			llmModel: " gpt-4o ",
		});
		const result = migrateLegacyLlmConfig(legacy, 1234);
		expect(result.llmProfiles).toHaveLength(1);
		const profile = result.llmProfiles![0];
		expect(profile.name).toBe("默认配置");
		expect(profile.baseUrl).toBe("https://api.example.com/v1");
		expect(profile.apiKey).toBe("sk-legacy");
		expect(profile.model).toBe("gpt-4o");
		expect(profile.prompt).toBe(DEFAULT_LLM_PROMPT);
		expect(profile.lastUsedAt).toBe(1234);
		expect(result.activeLlmProfileId).toBe(profile.id);
		expect(result.llmBaseUrl).toBe("  https://api.example.com/v1  ");
		expect(result.llmApiKey).toBe("  sk-legacy  ");
		expect(result.llmModel).toBe(" gpt-4o ");
	});

	it("迁移幂等：跑两次仍只有 1 个 profile，id 与 active 不变", () => {
		const legacy = baseSettings({ llmBaseUrl: "https://x", llmApiKey: "k", llmModel: "m" });
		const once = migrateLegacyLlmConfig(legacy, 100);
		const twice = migrateLegacyLlmConfig(once, 200);
		expect(twice.llmProfiles).toHaveLength(1);
		expect(twice.llmProfiles![0].id).toBe(once.llmProfiles![0].id);
		expect(twice.activeLlmProfileId).toBe(once.activeLlmProfileId);
		expect(twice.llmProfiles![0].lastUsedAt).toBe(100);
	});

	it("已有 profiles 时迁移不动（不重复建，active 不变）", () => {
		const existing = baseSettings({
			llmProfiles: [makeProfile("a", "A")],
			activeLlmProfileId: "a",
			llmBaseUrl: "https://new/v1",
			llmApiKey: "sk-new",
			llmModel: "m-new",
		});
		const result = migrateLegacyLlmConfig(existing, 500);
		expect(result.llmProfiles).toHaveLength(1);
		expect(result.llmProfiles![0].id).toBe("a");
		expect(result.activeLlmProfileId).toBe("a");
		expect(result.llmBaseUrl).toBe("https://new/v1");
	});

	it("incomplete legacy（缺 key / 缺 URL / 纯空白）→ 不建 profile，草稿保留", () => {
		const noKey = baseSettings({ llmBaseUrl: "https://x", llmModel: "m" });
		const r1 = migrateLegacyLlmConfig(noKey, 100);
		expect(r1.llmProfiles).toEqual([]);
		expect(r1.activeLlmProfileId).toBeUndefined();
		expect(r1.llmBaseUrl).toBe("https://x");
		expect(r1.llmApiKey).toBe("");

		const noUrl = baseSettings({ llmApiKey: "k", llmModel: "m", activeLlmProfileId: null });
		const r2 = migrateLegacyLlmConfig(noUrl, 100);
		expect(r2.llmProfiles).toEqual([]);
		expect(r2.activeLlmProfileId).toBeNull();

		const blank = baseSettings({ llmBaseUrl: "   ", llmApiKey: " ", llmModel: "\t" });
		const r3 = migrateLegacyLlmConfig(blank, 100);
		expect(r3.llmProfiles).toEqual([]);
		expect(r3.llmBaseUrl).toBe("   ");
		expect(r3.llmApiKey).toBe(" ");
	});

	it("迁移时 llmPrompt 空 → 用 DEFAULT_LLM_PROMPT 兜底", () => {
		const legacy = baseSettings({
			llmBaseUrl: "https://x",
			llmApiKey: "k",
			llmModel: "m",
			llmPrompt: "   ",
		});
		const result = migrateLegacyLlmConfig(legacy, 100);
		expect(result.llmProfiles![0].prompt).toBe(DEFAULT_LLM_PROMPT);
	});

	it("迁移时保留自定义 llmPrompt（trim 后）", () => {
		const legacy = baseSettings({
			llmBaseUrl: "https://x",
			llmApiKey: "k",
			llmModel: "m",
			llmPrompt: "  自定义提示  ",
		});
		const result = migrateLegacyLlmConfig(legacy, 100);
		expect(result.llmProfiles![0].prompt).toBe("自定义提示");
	});

	// 契约（修复点 2）：迁移建 profile 的完整条件 = 三字段非空 且 baseUrl 匹配 /^https?:\/\//i
	it("ftp:// 完整三字段 → 非法 URL，不建 profile，草稿保留，activeLlmProfileId 不变", () => {
		const legacy = baseSettings({
			llmBaseUrl: "ftp://legacy.example/v1",
			llmApiKey: "sk-legacy",
			llmModel: "gpt-4o",
			activeLlmProfileId: "keep-me",
		});
		const result = migrateLegacyLlmConfig(legacy, 100);
		expect(result.llmProfiles).toEqual([]);
		expect(result.activeLlmProfileId).toBe("keep-me");
		expect(result.llmBaseUrl).toBe("ftp://legacy.example/v1");
		expect(result.llmApiKey).toBe("sk-legacy");
		expect(result.llmModel).toBe("gpt-4o");
	});

	it("无 scheme（api.example.com/v1）→ 非法 URL，不建 profile，activeLlmProfileId 不变", () => {
		const legacy = baseSettings({
			llmBaseUrl: "api.example.com/v1",
			llmApiKey: "k",
			llmModel: "m",
			activeLlmProfileId: null,
		});
		const result = migrateLegacyLlmConfig(legacy, 100);
		expect(result.llmProfiles).toEqual([]);
		expect(result.activeLlmProfileId).toBeNull();
		expect(result.llmBaseUrl).toBe("api.example.com/v1");
	});

	it("http:// 完整三字段 → 建 profile 并启用（除 https 外也支持）", () => {
		const legacy = baseSettings({ llmBaseUrl: "http://localhost:8080/v1", llmApiKey: "k", llmModel: "m" });
		const result = migrateLegacyLlmConfig(legacy, 100);
		expect(result.llmProfiles).toHaveLength(1);
		expect(result.llmProfiles![0].baseUrl).toBe("http://localhost:8080/v1");
		expect(result.activeLlmProfileId).toBe(result.llmProfiles![0].id);
	});

	// 修复点 2（round 2）：http(s) 校验必须是真实 URL 谓词——无 host 的裸 scheme 不算合法
	it("http:// 无 host（有 key/model）→ 非法 URL，不建 profile，草稿保留，activeLlmProfileId 不变", () => {
		const legacy = baseSettings({
			llmBaseUrl: "http://",
			llmApiKey: "sk-legacy",
			llmModel: "gpt-4o",
		});
		const result = migrateLegacyLlmConfig(legacy, 100);
		expect(result.llmProfiles).toEqual([]);
		expect(result.activeLlmProfileId).toBeUndefined();
		expect(result.llmBaseUrl).toBe("http://");
		expect(result.llmApiKey).toBe("sk-legacy");
		expect(result.llmModel).toBe("gpt-4o");
	});

	it("https:// 无 host（有 key/model）→ 非法 URL，不建 profile", () => {
		const legacy = baseSettings({
			llmBaseUrl: "https://",
			llmApiKey: "sk-legacy",
			llmModel: "gpt-4o",
		});
		const result = migrateLegacyLlmConfig(legacy, 100);
		expect(result.llmProfiles).toEqual([]);
		expect(result.activeLlmProfileId).toBeUndefined();
	});

	it("合法 https://api.openai.com/v1 → 建 1 个 active profile", () => {
		const legacy = baseSettings({ llmBaseUrl: "https://api.openai.com/v1", llmApiKey: "k", llmModel: "m" });
		const result = migrateLegacyLlmConfig(legacy, 100);
		expect(result.llmProfiles).toHaveLength(1);
		expect(result.llmProfiles![0].baseUrl).toBe("https://api.openai.com/v1");
		expect(result.activeLlmProfileId).toBe(result.llmProfiles![0].id);
	});

	// 修复点 1（round 3）：判别器按「llmProfiles 字段是否存在」而非「数组是否非空」——
	// 已归一化的持久化 profile 状态（包括空数组 []）一律 no-op，绝不重跑 legacy 迁移。
	it("回归矩阵 (a)：valid legacy 且 profile 状态字段缺失 → 恰好 1 个 active「默认配置」", () => {
		const legacy = baseSettings({ llmBaseUrl: "https://api.openai.com/v1", llmApiKey: "sk-legacy", llmModel: "gpt-4o" });
		expect("llmProfiles" in legacy).toBe(false);
		expect("activeLlmProfileId" in legacy).toBe(false);
		const result = migrateLegacyLlmConfig(legacy, 1000);
		expect(result.llmProfiles).toHaveLength(1);
		expect(result.llmProfiles![0].name).toBe("默认配置");
		expect(result.activeLlmProfileId).toBe(result.llmProfiles![0].id);
	});

	it("回归矩阵 (b)：incomplete legacy（缺 key / URL 非法）→ 归一化 llmProfiles: [] 且不建 profile", () => {
		const missingKey = baseSettings({ llmBaseUrl: "https://x/v1", llmModel: "m" });
		expect("llmProfiles" in missingKey).toBe(false);
		const r1 = migrateLegacyLlmConfig(missingKey, 100);
		expect(r1.llmProfiles).toEqual([]);
		expect(r1.activeLlmProfileId).toBeUndefined();

		const badUrl = baseSettings({ llmBaseUrl: "ftp://x/v1", llmApiKey: "k", llmModel: "m", activeLlmProfileId: null });
		expect("llmProfiles" in badUrl).toBe(false);
		const r2 = migrateLegacyLlmConfig(badUrl, 100);
		expect(r2.llmProfiles).toEqual([]);
		expect(r2.activeLlmProfileId).toBeNull();
	});

	it("回归矩阵 (c)：Custom 经 applyDraft 持久化后重启迁移 → 仍为 [] + null，不建「默认配置」", () => {
		const initialized = migrateLegacyLlmConfig(baseSettings(), 1);
		const custom = applyDraft(initialized, {
			baseUrl: "https://custom/v1",
			apiKey: "sk-custom",
			model: "custom-model",
			prompt: "custom-prompt",
		});
		if (!custom.ok) throw new Error("applyDraft should succeed");
		expect(custom.settings.llmProfiles).toEqual([]);
		expect(custom.settings.activeLlmProfileId).toBeNull();
		const afterRestart = migrateLegacyLlmConfig(custom.settings, 2);
		expect(afterRestart.llmProfiles).toEqual([]);
		expect(afterRestart.activeLlmProfileId).toBeNull();
		expect(afterRestart.llmBaseUrl).toBe("https://custom/v1");
		expect(afterRestart.llmApiKey).toBe("sk-custom");
		expect(afterRestart.llmModel).toBe("custom-model");
		expect(afterRestart.llmPrompt).toBe("custom-prompt");
	});

	it("回归矩阵 (d)：已有非空 profiles + active → 二次迁移后 id/active/数组内容逐项不变", () => {
		const profileA = makeProfile("a", "配置A", { lastUsedAt: 42, baseUrl: "https://api.example.com/v1/a" });
		const existing = baseSettings({
			llmProfiles: [profileA],
			activeLlmProfileId: "a",
			llmBaseUrl: "https://flat/v1",
			llmApiKey: "sk-flat",
			llmModel: "m-flat",
			llmPrompt: "p-flat",
		});
		const once = migrateLegacyLlmConfig(existing, 100);
		const twice = migrateLegacyLlmConfig(once, 200);
		expect(twice.llmProfiles).toEqual([profileA]);
		expect(twice.activeLlmProfileId).toBe("a");
		expect(twice.llmProfiles![0].id).toBe("a");
		expect(twice.llmBaseUrl).toBe("https://flat/v1");
		expect(twice.llmApiKey).toBe("sk-flat");
		expect(twice.llmModel).toBe("m-flat");
		expect(twice.llmPrompt).toBe("p-flat");
	});

	it("回归矩阵 (e)：llmProfiles 显式为 [] 且平面字段合法、active 字段缺失 → 不建 profile，保持 [] 与 active 原值", () => {
		const normalized = baseSettings({
			llmProfiles: [],
			llmBaseUrl: "https://api.example.com/v1",
			llmApiKey: "sk-x",
			llmModel: "m",
		});
		expect("activeLlmProfileId" in normalized).toBe(false);
		const result = migrateLegacyLlmConfig(normalized, 100);
		expect(result.llmProfiles).toEqual([]);
		expect(result.activeLlmProfileId).toBeUndefined();
		expect(result.llmBaseUrl).toBe("https://api.example.com/v1");
		expect(result.llmApiKey).toBe("sk-x");
		expect(result.llmModel).toBe("m");
	});
});

describe("validateProfileInput", () => {
	const valid = { name: "配置", baseUrl: "https://api.example.com/v1", apiKey: "sk-x", model: "gpt-4o" };

	it("合法输入返回 null", () => {
		expect(validateProfileInput(valid, [])).toBeNull();
	});

	it("http:// 前缀通过", () => {
		expect(validateProfileInput({ ...valid, baseUrl: "http://localhost:8080/v1" }, [])).toBeNull();
	});

	it("空 name / 纯空白 name → 名称不能为空", () => {
		expect(validateProfileInput({ ...valid, name: "" }, [])).toBe("名称不能为空");
		expect(validateProfileInput({ ...valid, name: "   " }, [])).toBe("名称不能为空");
	});

	it("重名 → 名称已存在", () => {
		expect(validateProfileInput({ ...valid, name: "默认" }, ["默认"])).toBe("名称已存在");
	});

	it("空 baseUrl / apiKey / model 分别报错", () => {
		expect(validateProfileInput({ ...valid, baseUrl: " " }, [])).toBe("Base URL 不能为空");
		expect(validateProfileInput({ ...valid, apiKey: "" }, [])).toBe("API key 不能为空");
		expect(validateProfileInput({ ...valid, model: "  " }, [])).toBe("Model 不能为空");
	});

	it("ftp:// 拒绝，https:// 通过", () => {
		expect(validateProfileInput({ ...valid, baseUrl: "ftp://files.example.com" }, [])).toBe(
			"Base URL 必须以 http:// 或 https:// 开头",
		);
	});

	// 修复点 2（round 2）：无 host 的裸 scheme 不是合法 URL
	it("http:// / https:// 无 host → 非法 URL 报错", () => {
		expect(validateProfileInput({ ...valid, baseUrl: "http://" }, [])).toBe(
			"Base URL 必须以 http:// 或 https:// 开头",
		);
		expect(validateProfileInput({ ...valid, baseUrl: "https://" }, [])).toBe(
			"Base URL 必须以 http:// 或 https:// 开头",
		);
	});
});

describe("createProfile", () => {
	it("成功创建即立即启用，平面字段同步为 profile 值（全部 trim）", () => {
		const result = createProfile(
			baseSettings({ llmProfiles: [] }),
			{ name: " 新配置 ", baseUrl: " https://api.example.com/v1 ", apiKey: " sk-abc ", model: " gpt-4o ", prompt: " 提示词 " },
			5000,
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const settings = result.settings;
		expect(settings.llmProfiles).toHaveLength(1);
		const profile = settings.llmProfiles![0];
		expect(profile.name).toBe("新配置");
		expect(profile.baseUrl).toBe("https://api.example.com/v1");
		expect(profile.apiKey).toBe("sk-abc");
		expect(profile.model).toBe("gpt-4o");
		expect(profile.prompt).toBe("提示词");
		expect(profile.lastUsedAt).toBe(5000);
		expect(settings.activeLlmProfileId).toBe(profile.id);
		expect(settings.llmApiKey).toBe("sk-abc");
		expect(settings.llmBaseUrl).toBe("https://api.example.com/v1");
		expect(settings.llmModel).toBe("gpt-4o");
		expect(settings.llmPrompt).toBe("提示词");
	});

	it("id 唯一且稳定（两次创建不同，迁移后不变）", () => {
		const s0 = baseSettings({ llmProfiles: [] });
		const r1 = createProfile(s0, { name: "甲", baseUrl: "https://a/v1", apiKey: "k1", model: "m1", prompt: "p" }, 100);
		const r2 = createProfile(s0, { name: "乙", baseUrl: "https://b/v1", apiKey: "k2", model: "m2", prompt: "p" }, 200);
		if (!r1.ok || !r2.ok) throw new Error("should succeed");
		expect(r1.settings.llmProfiles![0].id.length).toBeGreaterThan(0);
		expect(r1.settings.llmProfiles![0].id).not.toBe(r2.settings.llmProfiles![0].id);
		const migrated = migrateLegacyLlmConfig(r1.settings, 300);
		expect(migrated.llmProfiles![0].id).toBe(r1.settings.llmProfiles![0].id);
	});

	it("重名 / 非法 URL → 失败", () => {
		const s0 = baseSettings({ llmProfiles: [makeProfile("a", "甲")] });
		const dup = createProfile(s0, { name: "甲", baseUrl: "https://x/v1", apiKey: "k", model: "m", prompt: "p" }, 100);
		expect(dup.ok).toBe(false);
		if (!dup.ok) expect(dup.error).toBe("名称已存在");
		const badUrl = createProfile(s0, { name: "丙", baseUrl: "ftp://x", apiKey: "k", model: "m", prompt: "p" }, 100);
		expect(badUrl.ok).toBe(false);
		if (!badUrl.ok) expect(badUrl.error).toContain("http://");
	});
});

describe("renameProfile / updateProfile", () => {
	const twoProfiles = () =>
		baseSettings({
			llmProfiles: [makeProfile("a", "配置A", { lastUsedAt: 100 }), makeProfile("b", "配置B", { lastUsedAt: 200 })],
			activeLlmProfileId: "a",
			llmApiKey: "sk-flat",
			llmBaseUrl: "https://flat/v1",
			llmModel: "flat-model",
			llmPrompt: "flat-prompt",
		});

	it("rename 自身同名通过（重名排除自身）", () => {
		const result = renameProfile(twoProfiles(), "a", " 配置A ");
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.settings.llmProfiles![0].name).toBe("配置A");
	});

	it("rename 与其他配置档重名 → 报错，入参未被修改", () => {
		const input = twoProfiles();
		const before = snapshot(input);
		const result = renameProfile(input, "b", "配置A");
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toBe("名称已存在");
		expect(snapshot(input)).toEqual(before);
	});

	it("rename 成功：只改 name，不 bump lastUsedAt，active 与平面字段不变", () => {
		const result = renameProfile(twoProfiles(), "b", "新名字");
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const settings = result.settings;
		const b = settings.llmProfiles!.find((p) => p.id === "b")!;
		expect(b.name).toBe("新名字");
		expect(b.lastUsedAt).toBe(200);
		expect(b.apiKey).toBe("sk-b");
		expect(settings.activeLlmProfileId).toBe("a");
		expect(settings.llmApiKey).toBe("sk-flat");
	});

	it("updateProfile 部分 patch：只更新提供的字段，不 bump lastUsedAt", () => {
		const result = updateProfile(twoProfiles(), "a", { model: " new-model " });
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const a = result.settings.llmProfiles!.find((p) => p.id === "a")!;
		expect(a.model).toBe("new-model");
		expect(a.baseUrl).toBe("https://api.example.com/v1/a");
		expect(a.apiKey).toBe("sk-a");
		expect(a.prompt).toBe(DEFAULT_LLM_PROMPT);
		expect(a.lastUsedAt).toBe(100);
	});

	it("updateProfile 校验：空字段 / 非法 URL / 重名", () => {
		const s0 = twoProfiles();
		const empty = updateProfile(s0, "a", { apiKey: "  " });
		expect(empty.ok).toBe(false);
		if (!empty.ok) expect(empty.error).toBe("API key 不能为空");
		const badUrl = updateProfile(s0, "a", { baseUrl: "ftp://x" });
		expect(badUrl.ok).toBe(false);
		if (!badUrl.ok) expect(badUrl.error).toContain("http://");
		const dup = updateProfile(s0, "b", { name: "配置A" });
		expect(dup.ok).toBe(false);
		if (!dup.ok) expect(dup.error).toBe("名称已存在");
	});

	// 修复点 4（round 2）：编辑当前配置档必须原子同步平面字段（translate() 实际读取的字段）
	it("更新当前配置档 → 平面字段原子同步为新值，profile 已更新，active 不变", () => {
		const result = updateProfile(twoProfiles(), "a", {
			baseUrl: "https://new.example/v1",
			apiKey: "new-key",
			model: "new-model",
			prompt: "new prompt",
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const settings = result.settings;
		const a = settings.llmProfiles!.find((p) => p.id === "a")!;
		expect(a.baseUrl).toBe("https://new.example/v1");
		expect(a.apiKey).toBe("new-key");
		expect(a.model).toBe("new-model");
		expect(a.prompt).toBe("new prompt");
		expect(settings.llmBaseUrl).toBe("https://new.example/v1");
		expect(settings.llmApiKey).toBe("new-key");
		expect(settings.llmModel).toBe("new-model");
		expect(settings.llmPrompt).toBe("new prompt");
		expect(settings.activeLlmProfileId).toBe("a");
	});

	it("更新非当前配置档 → 平面字段保持原值，仅该 profile 更新", () => {
		const result = updateProfile(twoProfiles(), "b", {
			baseUrl: "https://new.example/v1",
			apiKey: "new-key",
			model: "new-model",
			prompt: "new prompt",
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const settings = result.settings;
		const b = settings.llmProfiles!.find((p) => p.id === "b")!;
		expect(b.baseUrl).toBe("https://new.example/v1");
		expect(b.apiKey).toBe("new-key");
		expect(b.model).toBe("new-model");
		expect(b.prompt).toBe("new prompt");
		expect(settings.llmBaseUrl).toBe("https://flat/v1");
		expect(settings.llmApiKey).toBe("sk-flat");
		expect(settings.llmModel).toBe("flat-model");
		expect(settings.llmPrompt).toBe("flat-prompt");
	});

	it("重命名当前配置档 → 平面字段同步为该 profile 原值（name 非平面字段，不得损坏）", () => {
		const result = renameProfile(twoProfiles(), "a", "新名字A");
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const settings = result.settings;
		expect(settings.llmProfiles!.find((p) => p.id === "a")!.name).toBe("新名字A");
		expect(settings.llmBaseUrl).toBe("https://api.example.com/v1/a");
		expect(settings.llmApiKey).toBe("sk-a");
		expect(settings.llmModel).toBe("model-a");
		expect(settings.llmPrompt).toBe(DEFAULT_LLM_PROMPT);
	});
});

describe("deleteProfile", () => {
	it("当前启用配置档不可删除，settings 不变", () => {
		const input = baseSettings({ llmProfiles: [makeProfile("a", "A")], activeLlmProfileId: "a" });
		const before = snapshot(input);
		const result = deleteProfile(input, "a");
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toBe("当前启用配置档不可删除");
		expect(snapshot(input)).toEqual(before);
	});

	it("删除非当前配置档：active 与平面字段不变", () => {
		const input = baseSettings({
			llmProfiles: [makeProfile("a", "A"), makeProfile("b", "B")],
			activeLlmProfileId: "a",
			llmApiKey: "sk-flat",
		});
		const result = deleteProfile(input, "b");
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.settings.llmProfiles!.map((p) => p.id)).toEqual(["a"]);
		expect(result.settings.activeLlmProfileId).toBe("a");
		expect(result.settings.llmApiKey).toBe("sk-flat");
	});
});

describe("hasDeletableProfile", () => {
	// 契约（review 修复点）：删除保护只针对「删除目标 === activeId」，与数量无关。
	// 顶部「删除」按钮的禁用条件曾误写为 profiles.length < 2，
	// 导致「只有 1 个配置档且处于自定义状态（active 为 null）」时无法删除那个非当前启用的配置档。
	it("自定义状态（active 为 null）下只有 1 个配置档 → 可删除（回归：曾因数量 < 2 被禁用）", () => {
		expect(hasDeletableProfile([makeProfile("p1", "唯一")], null)).toBe(true);
	});

	it("唯一配置档且正是当前启用项 → 不可删除", () => {
		expect(hasDeletableProfile([makeProfile("p1", "唯一")], "p1")).toBe(false);
	});

	it("多配置档且当前启用其一 → 可删除（还有别的非当前配置档）", () => {
		expect(
			hasDeletableProfile([makeProfile("a", "A"), makeProfile("b", "B")], "a"),
		).toBe(true);
	});

	it("多配置档且当前启用其一 → 只删当前项仍被保护", () => {
		const profiles = [makeProfile("a", "A"), makeProfile("b", "B")];
		expect(hasDeletableProfile(profiles, "a")).toBe(true);
		const result = deleteProfile(
			baseSettings({ llmProfiles: profiles, activeLlmProfileId: "a" }),
			"a",
		);
		expect(result.ok).toBe(false);
	});

	it("无配置档 → 不可删除；profiles 为 undefined → 不可删除", () => {
		expect(hasDeletableProfile([], null)).toBe(false);
		expect(hasDeletableProfile(undefined, null)).toBe(false);
		expect(hasDeletableProfile([], "a")).toBe(false);
	});
});

describe("sortProfiles", () => {
	it("active 置顶，其余按 lastUsedAt 降序、0 排最后，并列按 name 再按 id", () => {
		const profiles = [
			makeProfile("p3", "C", { lastUsedAt: 0 }),
			makeProfile("p1", "B", { lastUsedAt: 2000 }),
			makeProfile("p0", "B", { lastUsedAt: 2000 }),
			makeProfile("p2", "A", { lastUsedAt: 3000 }),
		];
		const sorted = sortProfiles(profiles, "p3");
		expect(sorted.map((p) => p.id)).toEqual(["p3", "p2", "p0", "p1"]);
	});

	it("无 active 时按 lastUsedAt 降序，0 排最后", () => {
		const profiles = [
			makeProfile("p3", "C", { lastUsedAt: 0 }),
			makeProfile("p1", "B", { lastUsedAt: 2000 }),
			makeProfile("p2", "A", { lastUsedAt: 3000 }),
		];
		expect(sortProfiles(profiles).map((p) => p.id)).toEqual(["p2", "p1", "p3"]);
	});

	it("不改入参数组", () => {
		const profiles = [
			makeProfile("p2", "A", { lastUsedAt: 3000 }),
			makeProfile("p3", "C", { lastUsedAt: 0 }),
		];
		const before = snapshot(profiles);
		sortProfiles(profiles, "p3");
		expect(snapshot(profiles)).toEqual(before);
	});
});

describe("isCustomState", () => {
	// 契约（修复点 3）：自定义状态 = 配置草稿已应用为实际 LLM 参数、但未覆盖或另存为任何配置档。
	// applyDraft 会校验三字段非空 + URL 合法，因此「已应用的合法草稿」精确等价于：
	// activeLlmProfileId == null 且 baseUrl/apiKey/model（trim 后）全非空 且 baseUrl 匹配 /^https?:\/\//i。
	// prompt 不参与判定（DEFAULT_SETTINGS 的默认 prompt 非空但不算自定义）。
	it("active 为 null 且连接三字段全非空且 http(s) → true", () => {
		expect(
			isCustomState(baseSettings({ activeLlmProfileId: null, llmApiKey: "k", llmBaseUrl: "https://x/v1", llmModel: "m", llmPrompt: "" })),
		).toBe(true);
		expect(
			isCustomState(baseSettings({ activeLlmProfileId: null, llmApiKey: "k", llmBaseUrl: "http://localhost:8080/v1", llmModel: "m", llmPrompt: "任意 prompt 不参与" })),
		).toBe(true);
	});

	it("不完整形态（只有 apiKey / 只有 baseUrl / 只有 prompt 非空）→ false（契约：prompt 不参与判定，连接字段必须全部非空）", () => {
		expect(isCustomState(baseSettings({ activeLlmProfileId: null, llmApiKey: "k", llmBaseUrl: "", llmModel: "", llmPrompt: "" }))).toBe(false);
		expect(isCustomState(baseSettings({ activeLlmProfileId: null, llmApiKey: "", llmBaseUrl: "https://x", llmModel: "", llmPrompt: "" }))).toBe(false);
		expect(isCustomState(baseSettings({ activeLlmProfileId: null, llmApiKey: "", llmBaseUrl: "", llmModel: "", llmPrompt: "p" }))).toBe(false);
	});

	it("DEFAULT_SETTINGS 形态（连接字段全空 + 默认 prompt）→ false", () => {
		expect(isCustomState(baseSettings({ activeLlmProfileId: null }))).toBe(false);
		expect(isCustomState(baseSettings())).toBe(false);
	});

	it("非法 URL（ftp://）→ false，即使三字段非空", () => {
		expect(isCustomState(baseSettings({ activeLlmProfileId: null, llmBaseUrl: "ftp://x/v1", llmApiKey: "k", llmModel: "m" }))).toBe(false);
	});

	// 修复点 2（round 2）：无 host 的裸 scheme 不算合法 URL
	it("active 为 null 且平面 baseUrl 为 http:// 或 https://（无 host）→ false", () => {
		expect(
			isCustomState(baseSettings({ activeLlmProfileId: null, llmBaseUrl: "http://", llmApiKey: "k", llmModel: "m" })),
		).toBe(false);
		expect(
			isCustomState(baseSettings({ activeLlmProfileId: null, llmBaseUrl: "https://", llmApiKey: "k", llmModel: "m" })),
		).toBe(false);
	});

	it("active 为 null 且平面 http://localhost:8000/v1 三字段非空 → true", () => {
		expect(
			isCustomState(
				baseSettings({ activeLlmProfileId: null, llmBaseUrl: "http://localhost:8000/v1", llmApiKey: "k", llmModel: "m" }),
			),
		).toBe(true);
	});

	it("migrateLegacyLlmConfig(baseSettings()) 后 → false", () => {
		expect(isCustomState(migrateLegacyLlmConfig(baseSettings(), 100))).toBe(false);
	});

	it("migrateLegacyLlmConfig(ftp 完整 legacy) 后 → false（不建 profile，URL 非法不算自定义）", () => {
		const legacy = baseSettings({ llmBaseUrl: "ftp://legacy.example/v1", llmApiKey: "k", llmModel: "m" });
		expect(isCustomState(migrateLegacyLlmConfig(legacy, 100))).toBe(false);
	});

	it("applyDraft 合法草稿后 → true", () => {
		const result = applyDraft(baseSettings(), { baseUrl: "https://draft/v1", apiKey: "k", model: "m", prompt: "p" });
		if (!result.ok) throw new Error("should succeed");
		expect(isCustomState(result.settings)).toBe(true);
	});

	it("有 active 配置档 → false", () => {
		expect(
			isCustomState(baseSettings({ activeLlmProfileId: "a", llmApiKey: "k", llmBaseUrl: "https://x", llmModel: "m" })),
		).toBe(false);
	});

	it("null 且平面字段全空 → false", () => {
		expect(
			isCustomState(baseSettings({ activeLlmProfileId: null, llmApiKey: "", llmBaseUrl: "", llmModel: "", llmPrompt: "" })),
		).toBe(false);
	});
});

describe("applyDraft", () => {
	it("应用草稿 → 自定义状态（active=null，平面字段 := trim 值，不写 profile）", () => {
		const input = baseSettings({ llmProfiles: [makeProfile("a", "A")], activeLlmProfileId: "a" });
		const result = applyDraft(input, {
			baseUrl: " https://draft.example.com/v1 ",
			apiKey: " sk-draft ",
			model: " draft-model ",
			prompt: " 草稿提示 ",
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const settings = result.settings;
		expect(settings.activeLlmProfileId).toBeNull();
		expect(settings.llmBaseUrl).toBe("https://draft.example.com/v1");
		expect(settings.llmApiKey).toBe("sk-draft");
		expect(settings.llmModel).toBe("draft-model");
		expect(settings.llmPrompt).toBe("草稿提示");
		expect(settings.llmProfiles).toEqual(input.llmProfiles);
	});

	it("校验错误", () => {
		const input = baseSettings();
		const empty = applyDraft(input, { baseUrl: "", apiKey: "k", model: "m", prompt: "p" });
		expect(empty.ok).toBe(false);
		if (!empty.ok) expect(empty.error).toBe("Base URL 不能为空");
		const badUrl = applyDraft(input, { baseUrl: "ftp://x", apiKey: "k", model: "m", prompt: "p" });
		expect(badUrl.ok).toBe(false);
		if (!badUrl.ok) expect(badUrl.error).toBe("Base URL 必须以 http:// 或 https:// 开头");
	});

	// 修复点 2（round 2）：无 host 的裸 scheme 不是合法 URL
	it("https:// 无 host → ok:false", () => {
		const input = baseSettings();
		const badUrl = applyDraft(input, { baseUrl: "https://", apiKey: "k", model: "m", prompt: "p" });
		expect(badUrl.ok).toBe(false);
		if (!badUrl.ok) expect(badUrl.error).toBe("Base URL 必须以 http:// 或 https:// 开头");
	});
});

describe("saveDraftAsProfile / saveDraftToActiveProfile", () => {
	it("saveDraftAsProfile：以平面字段建 profile，prompt 空用默认，立即启用", () => {
		const input = baseSettings({
			llmProfiles: [makeProfile("a", "A")],
			activeLlmProfileId: null,
			llmBaseUrl: "https://draft.example.com/v1",
			llmApiKey: "sk-draft",
			llmModel: "draft-model",
			llmPrompt: "",
		});
		const result = saveDraftAsProfile(input, " 草稿配置 ", 7000);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const settings = result.settings;
		expect(settings.llmProfiles).toHaveLength(2);
		const p = settings.llmProfiles![1];
		expect(p.name).toBe("草稿配置");
		expect(p.baseUrl).toBe("https://draft.example.com/v1");
		expect(p.apiKey).toBe("sk-draft");
		expect(p.model).toBe("draft-model");
		expect(p.prompt).toBe(DEFAULT_LLM_PROMPT);
		expect(p.lastUsedAt).toBe(7000);
		expect(settings.activeLlmProfileId).toBe(p.id);
		// 平面字段必须与规范化后的 profile 一致（review round 4 修复点：曾漏同步）
		expect(settings.llmBaseUrl).toBe(p.baseUrl);
		expect(settings.llmApiKey).toBe(p.apiKey);
		expect(settings.llmModel).toBe(p.model);
		expect(settings.llmPrompt).toBe(p.prompt);
	});

	it("saveDraftAsProfile：平面字段带空白时，profile 与平面字段均取 trim 后值（prompt 空用默认并同步）", () => {
		const input = baseSettings({
			llmProfiles: [makeProfile("a", "A")],
			activeLlmProfileId: null,
			llmBaseUrl: "  https://draft.example.com/v1  ",
			llmApiKey: "  sk-draft  ",
			llmModel: "  draft-model  ",
			llmPrompt: "   ",
		});
		const result = saveDraftAsProfile(input, " 草稿配置 ", 7000);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const settings = result.settings;
		expect(settings.llmProfiles).toHaveLength(2);
		const p = settings.llmProfiles![1];
		expect(p.name).toBe("草稿配置");
		expect(p.baseUrl).toBe("https://draft.example.com/v1");
		expect(p.apiKey).toBe("sk-draft");
		expect(p.model).toBe("draft-model");
		expect(p.prompt).toBe(DEFAULT_LLM_PROMPT);
		expect(p.lastUsedAt).toBe(7000);
		expect(settings.activeLlmProfileId).toBe(p.id);
		// 平面字段逐项等于规范化后的 profile 字段
		expect(settings.llmBaseUrl).toBe(p.baseUrl);
		expect(settings.llmApiKey).toBe(p.apiKey);
		expect(settings.llmModel).toBe(p.model);
		expect(settings.llmPrompt).toBe(p.prompt);
		// 其它字段不受影响
		expect(settings.service).toBe(input.service);
		expect(settings.targetLanguage).toBe(input.targetLanguage);
	});

	it("saveDraftAsProfile：重名报错", () => {
		const input = baseSettings({
			llmProfiles: [makeProfile("a", "A")],
			llmBaseUrl: "https://x/v1",
			llmApiKey: "k",
			llmModel: "m",
		});
		const result = saveDraftAsProfile(input, "A", 100);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toBe("名称已存在");
	});

	it("saveDraftToActiveProfile：无 active → 错误", () => {
		const r1 = saveDraftToActiveProfile(baseSettings({ activeLlmProfileId: null }));
		expect(r1.ok).toBe(false);
		if (!r1.ok) expect(r1.error).toBe("当前没有可更新的配置档");
		const r2 = saveDraftToActiveProfile(baseSettings());
		expect(r2.ok).toBe(false);
		if (!r2.ok) expect(r2.error).toBe("当前没有可更新的配置档");
	});

	it("saveDraftToActiveProfile：profile := 平面字段，active 不变，不 bump lastUsedAt", () => {
		const input = baseSettings({
			llmProfiles: [makeProfile("a", "A", { lastUsedAt: 100 })],
			activeLlmProfileId: "a",
			llmBaseUrl: "https://new/v1",
			llmApiKey: "sk-new",
			llmModel: "m-new",
			llmPrompt: "p-new",
		});
		const result = saveDraftToActiveProfile(input);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const p = result.settings.llmProfiles![0];
		expect(p.baseUrl).toBe("https://new/v1");
		expect(p.apiKey).toBe("sk-new");
		expect(p.model).toBe("m-new");
		expect(p.prompt).toBe("p-new");
		expect(p.lastUsedAt).toBe(100);
		expect(result.settings.activeLlmProfileId).toBe("a");
	});
});

describe("hasDirtyDraft", () => {
	const baseline = { baseUrl: "https://x/v1", apiKey: "k", model: "m", prompt: "p" };

	it("完全相同 → false", () => {
		expect(hasDirtyDraft({ ...baseline }, baseline)).toBe(false);
	});

	it("任一字段 trim 后不同 → true", () => {
		expect(hasDirtyDraft({ ...baseline, apiKey: "k2" }, baseline)).toBe(true);
		expect(hasDirtyDraft({ ...baseline, model: "m2" }, baseline)).toBe(true);
		expect(hasDirtyDraft({ ...baseline, prompt: "" }, baseline)).toBe(true);
		expect(hasDirtyDraft({ ...baseline, baseUrl: "https://y/v1" }, baseline)).toBe(true);
	});

	it("仅空白差异 → false", () => {
		expect(hasDirtyDraft({ baseUrl: "  https://x/v1  ", apiKey: " k ", model: " m ", prompt: " p " }, baseline)).toBe(false);
	});
});

describe("resolveDirtySwitch", () => {
	const dirtySettings = () =>
		baseSettings({
			llmProfiles: [makeProfile("a", "A", { lastUsedAt: 100 }), makeProfile("b", "B", { lastUsedAt: 200 })],
			activeLlmProfileId: "a",
			llmBaseUrl: "https://dirty/v1",
			llmApiKey: "sk-dirty",
			llmModel: "m-dirty",
			llmPrompt: "p-dirty",
		});

	it("apply：当前配置档被草稿更新（不 bump），目标启用并 bump", () => {
		const result = resolveDirtySwitch(dirtySettings(), "b", "apply", 3000);
		expect(result.ok).toBe(true);
		if (!result.ok || !result.settings) return;
		const a = result.settings.llmProfiles!.find((p) => p.id === "a")!;
		const b = result.settings.llmProfiles!.find((p) => p.id === "b")!;
		expect(a.baseUrl).toBe("https://dirty/v1");
		expect(a.apiKey).toBe("sk-dirty");
		expect(a.model).toBe("m-dirty");
		expect(a.prompt).toBe("p-dirty");
		expect(a.lastUsedAt).toBe(100);
		expect(result.settings.activeLlmProfileId).toBe("b");
		expect(b.lastUsedAt).toBe(3000);
		expect(result.settings.llmBaseUrl).toBe(b.baseUrl);
	});

	it("discard：目标启用，草稿丢弃，当前配置档原样", () => {
		const result = resolveDirtySwitch(dirtySettings(), "b", "discard", 4000);
		expect(result.ok).toBe(true);
		if (!result.ok || !result.settings) return;
		const a = result.settings.llmProfiles!.find((p) => p.id === "a")!;
		const b = result.settings.llmProfiles!.find((p) => p.id === "b")!;
		expect(a.baseUrl).toBe("https://api.example.com/v1/a");
		expect(a.lastUsedAt).toBe(100);
		expect(result.settings.activeLlmProfileId).toBe("b");
		expect(b.lastUsedAt).toBe(4000);
		expect(result.settings.llmApiKey).toBe("sk-b");
	});

	it("cancel：settings 原样返回（引用不变）", () => {
		const input = dirtySettings();
		const result = resolveDirtySwitch(input, "b", "cancel");
		expect(result.ok).toBe(true);
		expect(result.settings).toBe(input);
	});

	it("apply 但无 active → 错误", () => {
		const input = baseSettings({
			llmProfiles: [makeProfile("b", "B")],
			activeLlmProfileId: null,
			llmBaseUrl: "https://x/v1",
			llmApiKey: "k",
			llmModel: "m",
			llmPrompt: "p",
		});
		const result = resolveDirtySwitch(input, "b", "apply", 100);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toBe("当前没有可更新的配置档");
	});

	it("目标不存在 → 错误", () => {
		const result = resolveDirtySwitch(dirtySettings(), "missing", "discard", 100);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toBe("配置档不存在");
	});
});

// 回归矩阵 round 5：URL 必须以字面 http:// 或 https:// 开头，不能只靠 new URL() 规范化结果。
// WHATWG new URL() 会把 https:api.example.com/v1、http:localhost:8080/v1、
// https:/api.example.com/v1、http:/localhost:8080/v1 规范化为带 host 的合法 URL，
// 修复前这些输入会绕过迁移/校验/Apply/Custom 判定，修复后必须全部拒绝。
describe("回归矩阵 round 5：字面 http(s):// 前缀", () => {
	// 四种 malformed：缺一个斜杠（https:、http:）+ 缺斜杠前缀；另含既有拒绝形态作为对照
	const malformed = [
		"https:api.example.com/v1",
		"http:localhost:8080/v1",
		"https:/api.example.com/v1",
		"http:/localhost:8080/v1",
	];
	// 合法控制组：既有的 http:// 与 https:// 前缀必须不受影响
	const validControls = ["http://localhost:8080/v1", "https://api.openai.com/v1"];
	const URL_ERROR = "Base URL 必须以 http:// 或 https:// 开头";

	it("validateProfileInput：四种 malformed → 非 null 错误；合法控制 → null", () => {
		for (const baseUrl of malformed) {
			expect(validateProfileInput({ name: `配置-${baseUrl}`, baseUrl, apiKey: "k", model: "m" }, [])).not.toBeNull();
			expect(validateProfileInput({ name: `配置-${baseUrl}`, baseUrl, apiKey: "k", model: "m" }, [])).toBe(URL_ERROR);
		}
		for (const baseUrl of validControls) {
			expect(validateProfileInput({ name: `配置-${baseUrl}`, baseUrl, apiKey: "k", model: "m" }, [])).toBeNull();
		}
	});

	it("applyDraft：四种 malformed → ok:false；合法控制 → ok:true", () => {
		for (const baseUrl of malformed) {
			const result = applyDraft(baseSettings(), { baseUrl, apiKey: "k", model: "m", prompt: "p" });
			expect(result.ok).toBe(false);
			if (!result.ok) expect(result.error).toBe(URL_ERROR);
		}
		for (const baseUrl of validControls) {
			const result = applyDraft(baseSettings(), { baseUrl, apiKey: "k", model: "m", prompt: "p" });
			expect(result.ok).toBe(true);
		}
	});

	it("isCustomState：active null + 三字段非空 + 四种 malformed → false；合法控制 → true", () => {
		for (const baseUrl of malformed) {
			expect(
				isCustomState(baseSettings({ activeLlmProfileId: null, llmBaseUrl: baseUrl, llmApiKey: "k", llmModel: "m" })),
			).toBe(false);
		}
		for (const baseUrl of validControls) {
			expect(
				isCustomState(baseSettings({ activeLlmProfileId: null, llmBaseUrl: baseUrl, llmApiKey: "k", llmModel: "m" })),
			).toBe(true);
		}
	});

	it("migrateLegacyLlmConfig：完整 legacy 三字段 + 四种 malformed（profile 字段缺失）→ llmProfiles []、不建 profile、activeLlmProfileId 保持原值；合法控制 → 建 active profile", () => {
		for (const baseUrl of malformed) {
			const legacy = baseSettings({
				llmBaseUrl: baseUrl,
				llmApiKey: "sk-legacy",
				llmModel: "gpt-4o",
				activeLlmProfileId: "keep-me",
			});
			expect("llmProfiles" in legacy).toBe(false);
			const result = migrateLegacyLlmConfig(legacy, 100);
			expect(result.llmProfiles).toEqual([]);
			expect(result.activeLlmProfileId).toBe("keep-me");
			expect(result.llmBaseUrl).toBe(baseUrl);
			expect(result.llmApiKey).toBe("sk-legacy");
			expect(result.llmModel).toBe("gpt-4o");
		}
		for (const baseUrl of validControls) {
			const legacy = baseSettings({ llmBaseUrl: baseUrl, llmApiKey: "k", llmModel: "m" });
			const result = migrateLegacyLlmConfig(legacy, 100);
			expect(result.llmProfiles).toHaveLength(1);
			expect(result.llmProfiles![0].baseUrl).toBe(baseUrl);
			expect(result.activeLlmProfileId).toBe(result.llmProfiles![0].id);
		}
	});

	it("输入不变性：validateProfileInput 与 migrateLegacyLlmConfig 均不修改入参（四种 malformed）", () => {
		for (const baseUrl of malformed) {
			const input = { name: "配置", baseUrl, apiKey: "k", model: "m" };
			expectNotMutated(input, (v) => validateProfileInput(v, []));
			const legacy = baseSettings({ llmBaseUrl: baseUrl, llmApiKey: "k", llmModel: "m", activeLlmProfileId: "keep-me" });
			expectNotMutated(legacy, (v) => migrateLegacyLlmConfig(v, 100));
		}
	});
});

describe("不修改入参", () => {
	const input = baseSettings({
		llmProfiles: [makeProfile("a", "A", { lastUsedAt: 100 }), makeProfile("b", "B", { lastUsedAt: 200 })],
		activeLlmProfileId: "a",
		llmBaseUrl: "https://flat/v1",
		llmApiKey: "sk-flat",
		llmModel: "m-flat",
		llmPrompt: "p-flat",
	});

	it("迁移 / 创建 / 更新 / 重命名 / 激活 / 删除 / 应用草稿 / 保存 / 排序 / dirty switch 均不改入参", () => {
		expectNotMutated(input, (s) => migrateLegacyLlmConfig(s, 1));
		expectNotMutated(input, (s) => createProfile(s, { name: "新", baseUrl: "https://n/v1", apiKey: "k", model: "m", prompt: "p" }, 2));
		expectNotMutated(input, (s) => updateProfile(s, "a", { model: "x" }));
		expectNotMutated(input, (s) => renameProfile(s, "a", "改名"));
		expectNotMutated(input, (s) => activateProfile(s, "b", 3));
		expectNotMutated(input, (s) => deleteProfile(s, "b"));
		expectNotMutated(input, (s) => applyDraft(s, { baseUrl: "https://d/v1", apiKey: "k", model: "m", prompt: "p" }));
		expectNotMutated(input, (s) => saveDraftAsProfile(s, "草稿", 4));
		expectNotMutated(input, (s) => saveDraftToActiveProfile(s));
		expectNotMutated(input, (s) => sortProfiles(s.llmProfiles ?? [], "a"));
		expectNotMutated(input, (s) => resolveDirtySwitch(s, "b", "apply", 5));
		expectNotMutated(input, (s) => resolveDirtySwitch(s, "b", "discard", 5));
		expectNotMutated(input, (s) => resolveDirtySwitch(s, "b", "cancel"));
	});
});

describe("stageDraft", () => {
	// 契约（review 修复点）：设置页草稿字段名（baseUrl/apiKey/model/prompt）与
	// 平面字段名（llmBaseUrl/llmApiKey/llmModel/llmPrompt）不同，
	// 直接 { ...settings, ...draft } 不会覆盖平面字段；stageDraft 是唯一正确的映射入口。
	it("把草稿映射到平面 LLM 字段，其余字段原样保留，不 trim（下游核心函数统一 trim）", () => {
		const input = baseSettings({
			llmProfiles: [makeProfile("a", "A")],
			activeLlmProfileId: "a",
			llmBaseUrl: "https://old/v1",
			llmApiKey: "sk-old",
			llmModel: "old-model",
			llmPrompt: "old-prompt",
		});
		const draft = { baseUrl: " https://new/v1 ", apiKey: " sk-new ", model: " new-model ", prompt: " new-prompt " };
		const staged = stageDraft(input, draft);
		expect(staged.llmBaseUrl).toBe(" https://new/v1 ");
		expect(staged.llmApiKey).toBe(" sk-new ");
		expect(staged.llmModel).toBe(" new-model ");
		expect(staged.llmPrompt).toBe(" new-prompt ");
		expect(staged.service).toBe("llm");
		expect(staged.targetLanguage).toBe("zh-CN");
		expect(staged.activeLlmProfileId).toBe("a");
		expect(staged.llmProfiles).toEqual(input.llmProfiles);
	});

	it("不改入参（settings 与 draft 都不变）", () => {
		const input = baseSettings({ llmBaseUrl: "https://old/v1", llmApiKey: "sk-old" });
		const draft = { baseUrl: "https://new/v1", apiKey: "sk-new", model: "m", prompt: "p" };
		const before = snapshot(input);
		const draftBefore = snapshot(draft);
		stageDraft(input, draft);
		expect(snapshot(input)).toEqual(before);
		expect(snapshot(draft)).toEqual(draftBefore);
	});
});

describe("设置页 UI 流程回归（stageDraft 组合）", () => {
	// 复刻 settings.ts 修复后的调用序列。修复前 UI 用 { ...settings, ...draft }，
	// 键名不匹配导致以下三个动作写入的是旧平面值而不是草稿。
	const withStalePlanar = () =>
		baseSettings({
			llmProfiles: [makeProfile("a", "A", { lastUsedAt: 100 }), makeProfile("b", "B", { lastUsedAt: 200 })],
			activeLlmProfileId: "a",
			llmBaseUrl: "https://stale/v1",
			llmApiKey: "sk-stale",
			llmModel: "stale-model",
			llmPrompt: "stale-prompt",
		});
	const draft = { baseUrl: "https://draft.example.com/v1", apiKey: "sk-draft", model: "draft-model", prompt: "draft-prompt" };

	it("保存为新配置档：新配置档使用草稿值（回归：曾使用旧平面值）", () => {
		const input = withStalePlanar();
		const result = saveDraftAsProfile(stageDraft(input, draft), "新配置", 5000);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const created = result.settings.llmProfiles!.find((p) => p.name === "新配置")!;
		expect(created.baseUrl).toBe("https://draft.example.com/v1");
		expect(created.apiKey).toBe("sk-draft");
		expect(created.model).toBe("draft-model");
		expect(created.prompt).toBe("draft-prompt");
		expect(result.settings.activeLlmProfileId).toBe(created.id);
	});

	it("更新当前配置档：配置档与平面字段都使用草稿值（回归：曾使用旧平面值）", () => {
		const input = withStalePlanar();
		const result = saveDraftToActiveProfile(stageDraft(input, draft));
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const a = result.settings.llmProfiles!.find((p) => p.id === "a")!;
		expect(a.baseUrl).toBe("https://draft.example.com/v1");
		expect(a.apiKey).toBe("sk-draft");
		expect(a.model).toBe("draft-model");
		expect(a.prompt).toBe("draft-prompt");
		expect(a.lastUsedAt).toBe(100);
		expect(result.settings.activeLlmProfileId).toBe("a");
		expect(result.settings.llmBaseUrl).toBe("https://draft.example.com/v1");
	});

	it("脏草稿切换「更新当前后切换」：当前配置档先被草稿更新，再启用目标", () => {
		const input = withStalePlanar();
		const result = resolveDirtySwitch(stageDraft(input, draft), "b", "apply", 3000);
		expect(result.ok).toBe(true);
		if (!result.ok || !result.settings) return;
		const a = result.settings.llmProfiles!.find((p) => p.id === "a")!;
		const b = result.settings.llmProfiles!.find((p) => p.id === "b")!;
		expect(a.baseUrl).toBe("https://draft.example.com/v1");
		expect(a.apiKey).toBe("sk-draft");
		expect(a.model).toBe("draft-model");
		expect(a.prompt).toBe("draft-prompt");
		expect(result.settings.activeLlmProfileId).toBe("b");
		expect(result.settings.llmBaseUrl).toBe(b.baseUrl);
		expect(b.lastUsedAt).toBe(3000);
	});
});
