import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: {
			// 真包 "obsidian" 只有类型声明无 JS entry，全新 clone 后 vite 无法解析；
			// 映射到测试 stub（tests/mocks/obsidian.ts），测试用 vi.mock 覆盖它。
			obsidian: fileURLToPath(new URL("./tests/mocks/obsidian.ts", import.meta.url)),
		},
	},
	test: {
		environment: "node",
		include: ["tests/**/*.test.ts"],
		passWithNoTests: true,
	},
});
