/**
 * 判定一个 Selection 是否位于翻译弹窗内。
 *
 * 弹窗内选区 (Popup Selection) 只用于选中并复制文字，绝不触发新翻译。
 * 锚点或焦点任一端落在弹窗内即视为弹窗内选区——用户可能从弹窗内拖到
 * 弹窗外，或从弹窗外拖进弹窗内，这两种情况都不应驱动翻译。
 *
 * 使用结构性类型（而非直接依赖 DOM 的 Selection/Node），便于在 node 环境
 * 下用假节点做纯逻辑测试。
 */
export interface SelectionLike {
	anchorNode: Node | null;
	focusNode: Node | null;
	rangeCount: number;
}

export interface NodeLike {
	contains(node: Node | null): boolean;
}

export function selectionBelongsToPopup(
	selection: SelectionLike | null | undefined,
	popupRoot: NodeLike | null | undefined,
): boolean {
	if (!selection || selection.rangeCount === 0 || !popupRoot) return false;

	const anchorInside = selection.anchorNode !== null && popupRoot.contains(selection.anchorNode);
	const focusInside = selection.focusNode !== null && popupRoot.contains(selection.focusNode);
	return anchorInside || focusInside;
}
