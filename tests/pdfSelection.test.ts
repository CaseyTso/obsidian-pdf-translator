import { describe, expect, it } from "vitest";
import { PDF_CONTAINER_SELECTORS } from "../src/pdfSelection";

describe("PDF_CONTAINER_SELECTORS 优先级", () => {
	// 回归（GUI 反馈 2026-08-15）：旧列表把 .pdfViewer（pdf.js 整页内容容器）排在最前，
	// 其矩形随滚动延伸到窗口下方很远，导致 bounds.bottom 巨大、弹窗永不翻到上方。
	const viewportSelectors = [".pdf-viewer-container", "#viewerContainer", ".pdfViewerContainer"];

	it("可视视口（滚动容器）必须排在最前，且整页内容容器已被移除", () => {
		expect(viewportSelectors).toContain(PDF_CONTAINER_SELECTORS[0]);
		expect(PDF_CONTAINER_SELECTORS).not.toContain(".pdfViewer");
	});

	it("视口命中时，外层包装选择器不得抢在视口之前", () => {
		const firstViewport = Math.min(
			...viewportSelectors
				.filter((selector) => PDF_CONTAINER_SELECTORS.includes(selector))
				.map((selector) => PDF_CONTAINER_SELECTORS.indexOf(selector)),
		);
		expect(firstViewport).toBeGreaterThanOrEqual(0);
		expect(PDF_CONTAINER_SELECTORS.indexOf(".pdf-container")).toBeGreaterThan(firstViewport);
	});
});
