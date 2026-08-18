import { describe, expect, it } from "vitest";
import { selectionBelongsToPopup } from "../src/popupSelection";

/**
 * 弹窗内选区 (Popup Selection)：锚点或焦点任一端落在弹窗内即视为弹窗内选区。
 * 它只用于选中并复制，绝不触发新翻译。
 */
interface FakeNode {
	id: string;
	contains(target: Node | null): boolean;
}

function makeNode(id: string): FakeNode {
	return { id, contains: () => false };
}

function makeRoot(contained: FakeNode[]): FakeNode {
	return {
		id: "root",
		contains: (target: Node | null) => {
			if (target === null) return false;
			const fake = target as unknown as FakeNode;
			return contained.some((node) => node.id === fake.id);
		},
	};
}

function makeSelection(anchor: FakeNode | null, focus: FakeNode | null, rangeCount = 1): Selection {
	return { anchorNode: anchor, focusNode: focus, rangeCount } as unknown as Selection;
}

describe("selectionBelongsToPopup", () => {
	const insideA = makeNode("inside-a");
	const insideB = makeNode("inside-b");
	const outside = makeNode("outside");
	const root = makeRoot([insideA, insideB]);

	it("锚点与焦点都在弹窗内 → 是弹窗内选区", () => {
		expect(selectionBelongsToPopup(makeSelection(insideA, insideB), root)).toBe(true);
	});

	it("锚点在弹窗内、焦点在弹窗外 → 是弹窗内选区", () => {
		expect(selectionBelongsToPopup(makeSelection(insideA, outside), root)).toBe(true);
	});

	it("锚点在弹窗外、焦点在弹窗内 → 是弹窗内选区", () => {
		expect(selectionBelongsToPopup(makeSelection(outside, insideB), root)).toBe(true);
	});

	it("锚点与焦点都在弹窗外 → 不是弹窗内选区", () => {
		expect(selectionBelongsToPopup(makeSelection(outside, outside), root)).toBe(false);
	});

	it("空选择（rangeCount 为 0）→ 不是弹窗内选区", () => {
		expect(selectionBelongsToPopup(makeSelection(insideA, insideA, 0), root)).toBe(false);
	});

	it("无 selection 或无弹窗根节点 → 不是弹窗内选区", () => {
		expect(selectionBelongsToPopup(null, root)).toBe(false);
		expect(selectionBelongsToPopup(undefined, root)).toBe(false);
		expect(selectionBelongsToPopup(makeSelection(insideA, insideA), null)).toBe(false);
		expect(selectionBelongsToPopup(makeSelection(insideA, insideA), undefined)).toBe(false);
	});
});
