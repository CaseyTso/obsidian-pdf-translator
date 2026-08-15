import { describe, it, expect } from "vitest";
import { normalizeSelectionText, isValidSelection } from "../src/normalize";

describe("normalizeSelectionText", () => {
	it("合并普通换行为空格", () => {
		expect(normalizeSelectionText("hello\nworld")).toBe("hello world");
	});

	it("拼接英文行末连字符断词", () => {
		expect(normalizeSelectionText("trans-\nlation")).toBe("translation");
	});

	it("多段保留段间双换行", () => {
		expect(normalizeSelectionText("para one\npara two\n\nnext block")).toBe("para one para two\n\nnext block");
	});

	it("清理 NBSP 与多余空白", () => {
		expect(normalizeSelectionText("a\u00a0 b\t  c")).toBe("a b c");
	});

	it("去除首尾空白", () => {
		expect(normalizeSelectionText("  x  ")).toBe("x");
	});
});

describe("isValidSelection", () => {
	it("至少一个字母或汉字", () => {
		expect(isValidSelection("  ")).toBe(false);
		expect(isValidSelection("Hello")).toBe(true);
		expect(isValidSelection("你好")).toBe(true);
		expect(isValidSelection("。")).toBe(false);
	});

	it("不超过 5000 字符", () => {
		expect(isValidSelection("a".repeat(5001))).toBe(false);
		expect(isValidSelection("a".repeat(5000))).toBe(true);
	});
});
