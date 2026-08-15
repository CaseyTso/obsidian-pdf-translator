import { describe, it, expect } from "vitest";
import { buildChatUrl, cleanModelOutput, mapHttpError } from "../src/services/llm";

describe("buildChatUrl", () => {
	it("baseURL 到 /v1 自动补 /chat/completions", () => {
		expect(buildChatUrl("https://api.openai.com/v1")).toBe("https://api.openai.com/v1/chat/completions");
	});

	it("容忍用户粘贴完整地址", () => {
		expect(buildChatUrl("https://api.openai.com/v1/chat/completions")).toBe("https://api.openai.com/v1/chat/completions");
	});

	it("去除末尾斜杠", () => {
		expect(buildChatUrl("https://api.openai.com/v1/")).toBe("https://api.openai.com/v1/chat/completions");
	});
});

describe("cleanModelOutput", () => {
	it("剥离 think 标签", () => {
		expect(cleanModelOutput("<think>foo</think>译文")).toBe("译文");
	});

	it("剥离代码围栏", () => {
		expect(cleanModelOutput("```text\n译文\n```")).toBe("译文");
	});

	it("剥离 '译文：' 前缀", () => {
		expect(cleanModelOutput("译文：你好")).toBe("你好");
	});

	// 修复点 3（round 2）：剥首尾引号后再补一次 trim，引号内纯空白 → 空串
	it("引号内纯空白 → 空串", () => {
		expect(cleanModelOutput('"   "')).toBe("");
	});
});

describe("mapHttpError", () => {
	it("401 → key 无效", () => {
		expect(mapHttpError(401)).toContain("401");
	});
	it("429 → 额度/频率", () => {
		expect(mapHttpError(429)).toContain("429");
	});
	it("其他状态码", () => {
		expect(mapHttpError(500)).toContain("500");
	});
});
