/**
 * 最小运行时 stub，仅用于测试运行器。
 *
 * 真包 "obsidian"（npm）只发布类型声明（obsidian.d.ts），没有 JS entry，
 * 全新 clone 后 `npm ci && npm run test` 会因 vite 无法解析入口而失败。
 * vitest.config.ts 通过 resolve.alias 把 "obsidian" 映射到此文件。
 *
 * 所有测试都通过 vi.mock("obsidian", ...) 注入假实现，本文件的 requestUrl
 * 永远不会在测试中被真正调用；插件运行时也不受影响（esbuild 将 "obsidian"
 * 标为 external，构建产物不包含本文件）。
 */

export interface RequestUrlResponse {
	status: number;
	json: unknown;
	text?: string;
	arrayBuffer?: ArrayBuffer;
	headers?: Record<string, string>;
}

export interface RequestUrlParam {
	url: string;
	method?: string;
	contentType?: string;
	body?: string | ArrayBuffer;
	headers?: Record<string, string>;
	throw?: boolean;
}

export function requestUrl(): never {
	throw new Error("obsidian.requestUrl is only available inside the Obsidian runtime; tests must mock it");
}
