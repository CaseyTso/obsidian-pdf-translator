import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestUrlResponse } from "obsidian";

const mocks = vi.hoisted(() => ({ requestUrl: vi.fn() }));

vi.mock("obsidian", () => ({ requestUrl: mocks.requestUrl }));

import { DEFAULT_LLM_PROMPT, LLM_TEST_TIMEOUT_MS, testConnection } from "../src/services";

function mockResolved(status: number, json: unknown): void {
	mocks.requestUrl.mockResolvedValue({ status, json } as unknown as RequestUrlResponse);
}

describe("testConnection", () => {
	beforeEach(() => {
		mocks.requestUrl.mockReset();
	});

	it("LLM_TEST_TIMEOUT_MS 为 15000", () => {
		expect(LLM_TEST_TIMEOUT_MS).toBe(15000);
	});

	it("DEFAULT_LLM_PROMPT 从 services 再导出可用", () => {
		expect(DEFAULT_LLM_PROMPT).toContain("简体中文");
	});

	it("2xx + 非空内容 → ok:true，response 为清理后内容，elapsed >= 0", async () => {
		mockResolved(200, { choices: [{ message: { content: "  你好，世界  " } }] });
		const result = await testConnection(
			{ baseUrl: "https://api.example.com/v1", apiKey: "sk-test", model: "gpt-4o" },
			1000,
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
		expect(result.response).toBe("你好，世界");
	});

	it("2xx 但内容为空（或 choices 缺失）→ ok:false「LLM 返回空结果」", async () => {
		mockResolved(200, { choices: [{ message: { content: "   " } }] });
		const r1 = await testConnection(
			{ baseUrl: "https://api.example.com/v1", apiKey: "sk-test", model: "gpt-4o" },
			1000,
		);
		expect(r1.ok).toBe(false);
		if (!r1.ok) expect(r1.error).toBe("LLM 返回空结果");

		mockResolved(200, {});
		const r2 = await testConnection(
			{ baseUrl: "https://api.example.com/v1", apiKey: "sk-test", model: "gpt-4o" },
			1000,
		);
		expect(r2.ok).toBe(false);
		if (!r2.ok) expect(r2.error).toBe("LLM 返回空结果");
	});

	// 契约（修复点 4）：成功条件 = 清理后的展示响应非空（只含 <think>…</think> 的 2xx 响应 raw 非空但清理后为空 → 失败）
	it("2xx 但内容清理后为空（纯 <think>…</think> 块）→ ok:false「LLM 返回空结果」", async () => {
		mockResolved(200, { choices: [{ message: { content: "<think>internal reasoning</think>" } }] });
		const result = await testConnection(
			{ baseUrl: "https://api.example.com/v1", apiKey: "sk-test", model: "gpt-4o" },
			1000,
		);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toBe("LLM 返回空结果");
	});

	it("2xx 内容为 <think>…</think> + 译文 → ok:true，response 为清理后的译文", async () => {
		mockResolved(200, { choices: [{ message: { content: "<think>internal reasoning</think>你好" } }] });
		const result = await testConnection(
			{ baseUrl: "https://api.example.com/v1", apiKey: "sk-test", model: "gpt-4o" },
			1000,
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.response).toBe("你好");
	});

	// 修复点 3（round 2）：cleanModelOutput 剥首尾引号后必须再次 trim，引号内纯空白 → 空串 → ok:false
	it("2xx 但内容清理后为纯空白（引号内纯空白）→ ok:false「LLM 返回空结果」", async () => {
		mockResolved(200, { choices: [{ message: { content: '"   "' } }] });
		const r1 = await testConnection(
			{ baseUrl: "https://api.example.com/v1", apiKey: "sk-test", model: "gpt-4o" },
			1000,
		);
		expect(r1.ok).toBe(false);
		if (!r1.ok) expect(r1.error).toBe("LLM 返回空结果");

		mockResolved(200, { choices: [{ message: { content: '<think>x</think>"   "' } }] });
		const r2 = await testConnection(
			{ baseUrl: "https://api.example.com/v1", apiKey: "sk-test", model: "gpt-4o" },
			1000,
		);
		expect(r2.ok).toBe(false);
		if (!r2.ok) expect(r2.error).toBe("LLM 返回空结果");
	});

	it("非 2xx → mapHttpError 文案", async () => {
		mockResolved(401, {});
		const r401 = await testConnection(
			{ baseUrl: "https://api.example.com/v1", apiKey: "sk-test", model: "gpt-4o" },
			1000,
		);
		expect(r401.ok).toBe(false);
		if (!r401.ok) expect(r401.error).toBe("401：API key 无效或未授权");

		mockResolved(500, {});
		const r500 = await testConnection(
			{ baseUrl: "https://api.example.com/v1", apiKey: "sk-test", model: "gpt-4o" },
			1000,
		);
		expect(r500.ok).toBe(false);
		if (!r500.ok) expect(r500.error).toBe("500：翻译服务暂时不可用");
	});

	it("2xx 但 body 带 error → 使用 error.message", async () => {
		mockResolved(200, { error: { message: "invalid api key format" } });
		const result = await testConnection(
			{ baseUrl: "https://api.example.com/v1", apiKey: "sk-test", model: "gpt-4o" },
			1000,
		);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toBe("invalid api key format");
	});

	it("requestUrl 抛异常 → ok:false「连接失败」，不向外抛异常", async () => {
		mocks.requestUrl.mockRejectedValue(new Error("ECONNREFUSED"));
		const result = await testConnection(
			{ baseUrl: "https://api.example.com/v1", apiKey: "sk-test", model: "gpt-4o" },
			1000,
		);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toBe("连接失败：无法访问服务");
	});

	it("超时 → ok:false「请求超时」", async () => {
		mocks.requestUrl.mockReturnValue(new Promise<RequestUrlResponse>(() => {}));
		const result = await testConnection(
			{ baseUrl: "https://api.example.com/v1", apiKey: "sk-test", model: "gpt-4o" },
			20,
		);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toBe("请求超时");
	}, 5000);

	it("请求形状：/chat/completions、POST、Bearer、固定 Hello 消息、无文档样本文本", async () => {
		mockResolved(200, { choices: [{ message: { content: "你好" } }] });
		const result = await testConnection(
			{ baseUrl: "https://api.example.com/v1/", apiKey: "  sk-shape  ", model: "  gpt-4o  " },
			1000,
		);
		expect(result.ok).toBe(true);
		const call = mocks.requestUrl.mock.calls[0][0] as { url: string; method: string; contentType: string; headers: Record<string, string>; body: string };
		expect(call.url.endsWith("/chat/completions")).toBe(true);
		expect(call.method).toBe("POST");
		expect(call.contentType).toBe("application/json");
		expect(call.headers.Authorization).toBe("Bearer sk-shape");
		const body = JSON.parse(call.body);
		expect(body.model).toBe("gpt-4o");
		expect(body.stream).toBe(false);
		expect(body.messages).toHaveLength(2);
		expect(body.messages[0].role).toBe("system");
		expect(body.messages[0].content).toContain("Translate");
		expect(body.messages[1]).toEqual({ role: "user", content: "Hello" });
		expect(call.body).not.toContain("医学");
		expect(call.body).not.toContain("文献");
	});

	it("draft 对象不被修改", async () => {
		const input = { baseUrl: "https://api.example.com/v1", apiKey: "sk-immutable", model: "gpt-4o" };
		const before = { ...input };
		mockResolved(200, { choices: [{ message: { content: "你好" } }] });
		await testConnection(input, 1000);
		expect(input).toEqual(before);
	});

	it("结果文本绝不包含 apiKey", async () => {
		const key = "sk-top-secret-789";
		// 成功响应
		mockResolved(200, { choices: [{ message: { content: "你好" } }] });
		const okRes = await testConnection(
			{ baseUrl: "https://api.example.com/v1", apiKey: key, model: "gpt-4o" },
			1000,
		);
		expect(JSON.stringify(okRes)).not.toContain(key);
		// 2xx 但服务端错误消息内嵌 key → 必须脱敏
		mockResolved(200, { error: { message: `bad key: ${key}` } });
		const errRes = await testConnection(
			{ baseUrl: "https://api.example.com/v1", apiKey: key, model: "gpt-4o" },
			1000,
		);
		expect(JSON.stringify(errRes)).not.toContain(key);
		// 网络错误细节内嵌 key
		mocks.requestUrl.mockRejectedValue(new Error(`boom ${key}`));
		const netRes = await testConnection(
			{ baseUrl: "https://api.example.com/v1", apiKey: key, model: "gpt-4o" },
			1000,
		);
		expect(JSON.stringify(netRes)).not.toContain(key);
	});

	// 修复点 1（round 2）：先对完整 cleaned 脱敏再截断；并防御「只回显 key 前缀」的部分片段
	it("key 回显在截断点之后（先脱敏后截断）→ ok:true 且不泄漏 key / key 前 10 字符", async () => {
		const apiKey = "sk-0123456789abcdefghij"; // 长度 22 ≥ 10
		mockResolved(200, { choices: [{ message: { content: "x".repeat(190) + apiKey } }] });
		const result = await testConnection(
			{ baseUrl: "https://api.example.com/v1", apiKey, model: "gpt-4o" },
			1000,
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.response).toContain("[REDACTED]");
		expect(result.response).not.toContain(apiKey);
		expect(result.response).not.toContain(apiKey.slice(0, 10));
	});

	it("模型只回显 key 前 8 字符（部分片段）→ 该前缀同样被替换", async () => {
		const apiKey = "sk-0123456789abcdefghij";
		const prefix8 = apiKey.slice(0, 8);
		mockResolved(200, { choices: [{ message: { content: `prefix ${prefix8} suffix` } }] });
		const result = await testConnection(
			{ baseUrl: "https://api.example.com/v1", apiKey, model: "gpt-4o" },
			1000,
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.response).not.toContain(prefix8);
	});

	// 修复点（review round 2 收尾）：key 短于 4 字符时，循环下限 `len >= 4` 一次都不满足，
	// 完整 key 也不会被替换——「结果绝不含 key」是绝对规则，必须兜住最短 key。
	it("key 长度 < 4 时完整 key 同样被脱敏 → ok:true 且不泄漏 key", async () => {
		const apiKey = "abc"; // 长度 3 < 4
		mockResolved(200, { choices: [{ message: { content: "x".repeat(10) + apiKey } }] });
		const result = await testConnection(
			{ baseUrl: "https://api.example.com/v1", apiKey, model: "gpt-4o" },
			1000,
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.response).toContain("[REDACTED]");
		expect(result.response).not.toContain(apiKey);
	});
});
