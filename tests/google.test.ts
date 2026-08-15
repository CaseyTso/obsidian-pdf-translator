import { describe, it, expect } from "vitest";
import { parseGoogleResponse } from "../src/services/google";

describe("parseGoogleResponse", () => {
	it("拼接多段译文", () => {
		const body = [[["你好", "hello", null, null, 10], [", 世界", ", world", null, null, 7]], null, "en", null];
		expect(parseGoogleResponse(body)).toBe("你好, 世界");
	});

	it("跳过空段", () => {
		const body = [[["你好", "hello", null, null, 10], null, [" 世界", " world", null, null, 6]], null, "en"];
		expect(parseGoogleResponse(body)).toBe("你好 世界");
	});

	it("返回检测到的源语言", () => {
		const body = [[["你好", "hello", null, null, 10]], null, "en"];
		expect(parseGoogleResponse(body)).toBe("你好");
	});
});
