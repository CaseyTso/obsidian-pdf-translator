export const POPUP_DEFAULT_WIDTH = 420;
export const POPUP_MARGIN = 12;
export const POPUP_GAP = 8;
export const POPUP_MAX_HEIGHT_RATIO = 0.45;

export type PopupPlacementSide = "above" | "below";

export interface PopupBox {
	left: number;
	top: number;
	width: number;
	height: number;
}

export interface PopupPlacement extends PopupBox {
	placement: PopupPlacementSide;
}

export interface PopupPlacementInput {
	selection: PopupBox;
	bounds: PopupBox;
	contentHeight: number;
	contentWidth?: number;
}

export function computePopupPlacement(input: PopupPlacementInput): PopupPlacement {
	const { selection, bounds } = input;
	const width = Math.min(input.contentWidth ?? POPUP_DEFAULT_WIDTH, Math.max(0, bounds.width - POPUP_MARGIN * 2));
	const maxHeight = Math.max(0, bounds.height * POPUP_MAX_HEIGHT_RATIO);
	const requestedHeight = Math.min(Math.max(0, input.contentHeight), maxHeight);
	const spaceBelow = Math.max(0, bottom(bounds) - POPUP_MARGIN - (bottom(selection) + POPUP_GAP));
	const spaceAbove = Math.max(0, selection.top - POPUP_GAP - (bounds.top + POPUP_MARGIN));
	const placement = chooseSide(spaceBelow, spaceAbove, requestedHeight);
	const availableHeight = placement === "below" ? spaceBelow : spaceAbove;
	const height = Math.min(requestedHeight, availableHeight);
	const left = clamp(
		selection.left,
		bounds.left + POPUP_MARGIN,
		Math.max(bounds.left + POPUP_MARGIN, right(bounds) - POPUP_MARGIN - width),
	);
	const desiredTop = placement === "below" ? bottom(selection) + POPUP_GAP : selection.top - POPUP_GAP - height;

	return {
		left,
		top: clamp(desiredTop, bounds.top + POPUP_MARGIN, Math.max(bounds.top + POPUP_MARGIN, bottom(bounds) - POPUP_MARGIN - height)),
		width,
		height,
		placement,
	};
}

export function clampPopupToBounds(popup: PopupBox, bounds: PopupBox): PopupBox {
	const width = Math.min(popup.width, Math.max(0, bounds.width - POPUP_MARGIN * 2));
	const height = Math.min(popup.height, Math.max(0, bounds.height * POPUP_MAX_HEIGHT_RATIO));
	return {
		left: clamp(popup.left, bounds.left + POPUP_MARGIN, Math.max(bounds.left + POPUP_MARGIN, right(bounds) - POPUP_MARGIN - width)),
		top: clamp(popup.top, bounds.top + POPUP_MARGIN, Math.max(bounds.top + POPUP_MARGIN, bottom(bounds) - POPUP_MARGIN - height)),
		width,
		height,
	};
}

/**
 * 把 PDF 区域边界裁剪到窗口可视区（viewport）内。防御性措施：
 * 若容器解析错误（例如误匹配到随滚动延伸出窗口的整页内容容器），
 * 边界底部会远大于窗口高度，导致「下方空间」恒为充足、弹窗永不翻到上方，
 * 甚至被放到窗口之外。裁剪后 placement 决策只基于真正可见的空间。
 */
export function clampBoundsToWindow(bounds: PopupBox, viewport: PopupBox): PopupBox {
	const left = Math.max(bounds.left, viewport.left);
	const top = Math.max(bounds.top, viewport.top);
	const rightClipped = Math.min(right(bounds), right(viewport));
	const bottomClipped = Math.min(bottom(bounds), bottom(viewport));
	return {
		left,
		top,
		width: Math.max(0, rightClipped - left),
		height: Math.max(0, bottomClipped - top),
	};
}

function chooseSide(spaceBelow: number, spaceAbove: number, requestedHeight: number): PopupPlacementSide {
	if (spaceBelow >= requestedHeight) return "below";
	if (spaceAbove >= requestedHeight) return "above";
	return spaceBelow >= spaceAbove ? "below" : "above";
}

function right(box: PopupBox): number {
	return box.left + box.width;
}

function bottom(box: PopupBox): number {
	return box.top + box.height;
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}