import { describe, expect, it } from "vitest";
import {
	clampBoundsToWindow,
	clampPopupToBounds,
	computePopupPlacement,
	POPUP_DEFAULT_WIDTH,
	POPUP_GAP,
	POPUP_MARGIN,
	POPUP_MAX_HEIGHT_RATIO,
} from "../src/popupGeometry";

function box(left: number, top: number, width: number, height: number) {
	return { left, top, width, height };
}

function right(b: { left: number; width: number }): number {
	return b.left + b.width;
}

function bottom(b: { top: number; height: number }): number {
	return b.top + b.height;
}

function overlaps(a: { left: number; top: number; width: number; height: number }, b: { left: number; top: number; width: number; height: number }): boolean {
	return a.left < right(b) && right(a) > b.left && a.top < bottom(b) && bottom(a) > b.top;
}

describe("computePopupPlacement", () => {
	const bounds = box(200, 80, 800, 900);

	it("将弹窗限制在 PDF 阅读区域内，不进入左右侧栏", () => {
		const selection = box(180, 200, 120, 20);
		const placed = computePopupPlacement({
			selection,
			bounds,
			contentHeight: 180,
		});

		expect(placed.left).toBeGreaterThanOrEqual(bounds.left + POPUP_MARGIN);
		expect(right(placed)).toBeLessThanOrEqual(right(bounds) - POPUP_MARGIN);
		expect(placed.top).toBeGreaterThanOrEqual(bounds.top + POPUP_MARGIN);
		expect(bottom(placed)).toBeLessThanOrEqual(bottom(bounds) - POPUP_MARGIN);
		expect(placed.left).toBeGreaterThanOrEqual(200);
		expect(right(placed)).toBeLessThanOrEqual(1000);
	});

	it("下方空间足够时优先放在选区下方且不遮挡选区", () => {
		const selection = box(240, 200, 160, 24);
		const placed = computePopupPlacement({
			selection,
			bounds,
			contentHeight: 160,
		});

		expect(placed.placement).toBe("below");
		expect(placed.top).toBe(bottom(selection) + POPUP_GAP);
		expect(overlaps(placed, selection)).toBe(false);
		expect(placed.width).toBe(POPUP_DEFAULT_WIDTH);
		expect(placed.height).toBe(160);
	});

	it("下方不足且上方足够时放到选区上方", () => {
		const selection = box(240, 900, 160, 24);
		const placed = computePopupPlacement({
			selection,
			bounds,
			contentHeight: 200,
		});

		expect(placed.placement).toBe("above");
		expect(bottom(placed)).toBe(selection.top - POPUP_GAP);
		expect(overlaps(placed, selection)).toBe(false);
	});

	it("两侧都不足时选择空间更大的一侧并压缩高度", () => {
		const tightBounds = box(0, 0, 600, 400);
		const selection = box(80, 190, 200, 50);
		const placed = computePopupPlacement({
			selection,
			bounds: tightBounds,
			contentHeight: 320,
		});

		const spaceBelow = bottom(tightBounds) - POPUP_MARGIN - (bottom(selection) + POPUP_GAP);
		const spaceAbove = selection.top - POPUP_GAP - (tightBounds.top + POPUP_MARGIN);
		expect(spaceBelow).toBeLessThan(tightBounds.height * POPUP_MAX_HEIGHT_RATIO);
		expect(spaceAbove).toBeLessThan(tightBounds.height * POPUP_MAX_HEIGHT_RATIO);
		expect(placed.placement).toBe("above");
		expect(placed.height).toBe(spaceAbove);
		expect(placed.height).toBeLessThan(320);
		expect(overlaps(placed, selection)).toBe(false);
	});

	it("窄 PDF 区域时宽度小于 420 并保留边距", () => {
		const narrow = box(40, 60, 280, 700);
		const selection = box(80, 200, 80, 18);
		const placed = computePopupPlacement({
			selection,
			bounds: narrow,
			contentHeight: 120,
		});

		expect(placed.width).toBe(narrow.width - POPUP_MARGIN * 2);
		expect(placed.width).toBeLessThan(POPUP_DEFAULT_WIDTH);
		expect(placed.left).toBe(narrow.left + POPUP_MARGIN);
		expect(right(placed)).toBe(right(narrow) - POPUP_MARGIN);
	});

	it("最大高度不超过 PDF 区域的 45%，短内容不撑满", () => {
		const tallBounds = box(0, 0, 900, 1000);
		const selection = box(80, 40, 120, 20);
		const long = computePopupPlacement({
			selection,
			bounds: tallBounds,
			contentHeight: 800,
		});
		const short = computePopupPlacement({
			selection,
			bounds: tallBounds,
			contentHeight: 90,
		});

		expect(long.height).toBe(tallBounds.height * POPUP_MAX_HEIGHT_RATIO);
		expect(long.height).toBeLessThan(800);
		expect(short.height).toBe(90);
	});
});

describe("clampPopupToBounds", () => {
	it("滚动后只按当前屏幕位置 clamp，不跟随旧选区", () => {
		const bounds = box(200, 80, 800, 900);
		const selection = box(240, 200, 160, 24);
		const placed = computePopupPlacement({
			selection,
			bounds,
			contentHeight: 160,
		});

		const scrolledSelection = box(240, 20, 160, 24);
		const following = computePopupPlacement({
			selection: scrolledSelection,
			bounds,
			contentHeight: 160,
		});
		const clamped = clampPopupToBounds(placed, bounds);

		expect(clamped.left).toBe(placed.left);
		expect(clamped.top).toBe(placed.top);
		expect(clamped.top).not.toBe(following.top);
	});

	it("resize 后把越界弹窗重新夹回 PDF 区域", () => {
		const popup = box(700, 500, 420, 180);
		const smaller = box(200, 80, 400, 600);
		const clamped = clampPopupToBounds(popup, smaller);

		expect(clamped.width).toBe(smaller.width - POPUP_MARGIN * 2);
		expect(clamped.left).toBeGreaterThanOrEqual(smaller.left + POPUP_MARGIN);
		expect(right(clamped)).toBeLessThanOrEqual(right(smaller) - POPUP_MARGIN);
		expect(clamped.top).toBeGreaterThanOrEqual(smaller.top + POPUP_MARGIN);
		expect(bottom(clamped)).toBeLessThanOrEqual(bottom(smaller) - POPUP_MARGIN);
		expect(clamped.height).toBeLessThanOrEqual(smaller.height * POPUP_MAX_HEIGHT_RATIO);
	});
});

describe("clampBoundsToWindow", () => {
	const viewport = box(0, 0, 1400, 900);

	it("越界边界裁剪到窗口内（上下左右都裁）", () => {
		// 模拟 pdf.js 整页内容容器：超出窗口下方数千像素
		const huge = box(-100, -50, 1600, 16000);
		const clamped = clampBoundsToWindow(huge, viewport);
		expect(clamped.left).toBe(0);
		expect(clamped.top).toBe(0);
		expect(right(clamped)).toBe(1400);
		expect(bottom(clamped)).toBe(900);
	});

	it("已在窗口内的边界保持不变", () => {
		const inside = box(100, 80, 1200, 700);
		const clamped = clampBoundsToWindow(inside, viewport);
		expect(clamped).toEqual(inside);
	});

	it("完全在窗口外时返回零尺寸盒子（不会出现负尺寸）", () => {
		const outside = box(2000, 2000, 500, 500);
		const clamped = clampBoundsToWindow(outside, viewport);
		expect(clamped.width).toBe(0);
		expect(clamped.height).toBe(0);
	});
});

describe("回归：选区在可视区底部时弹窗必须翻到上方（GUI 反馈 2026-08-15）", () => {
	const viewport = box(0, 0, 1400, 900);
	// 旧 bug 复现：bounds 解析到了随滚动延伸到窗口下方的整页内容容器
	const hugeBounds = box(100, 100, 1200, 16000);
	// 选区紧贴可视区底部（用户在页面底部划词）
	const selection = box(300, 820, 500, 40);
	const contentHeight = 75;

	it("未裁剪的越界边界会让弹窗被判定为 below 并超出窗口底部（回归基线）", () => {
		const placed = computePopupPlacement({ selection, bounds: hugeBounds, contentHeight });
		expect(placed.placement).toBe("below");
		expect(bottom(placed)).toBeGreaterThan(viewport.height);
	});

	it("裁剪到窗口后，下方不足 → 翻到选区上方且不超出窗口", () => {
		const clamped = clampBoundsToWindow(hugeBounds, viewport);
		const placed = computePopupPlacement({ selection, bounds: clamped, contentHeight });
		expect(placed.placement).toBe("above");
		expect(bottom(placed)).toBe(selection.top - POPUP_GAP);
		expect(bottom(placed)).toBeLessThanOrEqual(viewport.height);
		expect(overlaps(placed, selection)).toBe(false);
	});
});
