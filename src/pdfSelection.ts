import type { App, TFile } from "obsidian";
import { normalizeSelectionText } from "./normalize";
import type { PdfTextSelection } from "./types";

interface PdfLikeView {
	containerEl: HTMLElement;
	file?: TFile | null;
	getViewType(): string;
}

interface SelectionWithContext {
	selection: Selection;
	rectOffset?: DOMRect;
}

/**
 * 命中优先级（自上而下，取第一个有匹配的选择器）：
 * 1. `.pdf-viewer-container` / `#viewerContainer` / `.pdfViewerContainer`
 *    —— PDF 页面的「可视视口 / 滚动容器」。它的 getBoundingClientRect 就是当前
 *    PDF 阅读区域：固定大小、始终在窗口内。弹窗定位必须以它为边界。
 * 2. `.pdf-container` / `.pdf-embed` —— 外层包装（含工具栏/侧栏区域，仍在窗口内）。
 * 3. 其余为旧版/嵌入场景回退。
 *
 * 注意：`.pdfViewer`（pdf.js 的整页内容容器，本仓库的 DOM 里 19 页都有 .page 元素）
 * 绝对不能排在前列——它的矩形随滚动延伸到窗口下方很远，会让「下方空间」恒为充足，
 * 弹窗永远不会在底部选区时翻到上方（GUI 回归见 tests/popupGeometry.test.ts）。
 */
export const PDF_CONTAINER_SELECTORS = [
	".pdf-viewer-container",
	"#viewerContainer",
	".pdfViewerContainer",
	".pdf-container",
	".pdf-embed",
	".pdf-viewer",
	".mod-pdf",
	".document-container",
	".textLayer",
];

export class PdfSelectionReader {
	constructor(private app: App) {}

	readSelection(): PdfTextSelection | null {
		const activeContext = this.getActivePdfContainer();
		if (!activeContext) return null;

		const selectionContext = this.getSelectionContext(activeContext.container);
		if (!selectionContext) return null;

		const selection = selectionContext.selection;
		if (selection.rangeCount === 0 || selection.isCollapsed) return null;

		const text = normalizeSelectionText(selection.toString());
		if (!text) return null;

		const rect = this.getSelectionRect(selection, selectionContext.rectOffset);
		return rect ? { text, rect, pdfBounds: activeContext.container.getBoundingClientRect() } : null;
	}

	getActivePdfBounds(): DOMRect | null {
		return this.getActivePdfContainer()?.container.getBoundingClientRect() ?? null;
	}

	private getActivePdfContainer(): { container: HTMLElement; file?: TFile } | null {
		const activeLeaf = this.app.workspace.activeLeaf;
		const view = activeLeaf?.view as PdfLikeView | undefined;
		if (!view?.containerEl || !this.isPdfView(view)) return null;

		const innerPdfContainer = PDF_CONTAINER_SELECTORS
			.map((selector) => view.containerEl.querySelector<HTMLElement>(selector))
			.find((element): element is HTMLElement => Boolean(element));

		return {
			container: innerPdfContainer ?? view.containerEl,
			file: view.file ?? undefined,
		};
	}

	private isPdfView(view: PdfLikeView): boolean {
		const viewType = view.getViewType();
		if (viewType === "pdf") return true;

		const filePath = view.file?.path?.toLowerCase() ?? "";
		if (filePath.endsWith(".pdf")) return true;

		return PDF_CONTAINER_SELECTORS.some((selector) => view.containerEl.querySelector(selector));
	}

	private getSelectionContext(container: HTMLElement): SelectionWithContext | null {
		const documentSelection = activeDocument.getSelection();
		if (
			documentSelection &&
			documentSelection.rangeCount > 0 &&
			this.selectionBelongsToContainer(documentSelection, container)
		) {
			return { selection: documentSelection };
		}

		return this.getIframeSelection(container);
	}

	private selectionBelongsToContainer(selection: Selection, container: HTMLElement): boolean {
		if (selection.rangeCount === 0) return false;
		const range = selection.getRangeAt(0);
		const ancestor = range.commonAncestorContainer;
		return container.contains(ancestor);
	}

	private getIframeSelection(container: HTMLElement): SelectionWithContext | null {
		const frames = Array.from(container.querySelectorAll("iframe"));
		for (const frame of frames) {
			try {
				const frameWindow = frame.contentWindow;
				const frameSelection = frameWindow?.getSelection();
				if (!frameWindow || !frameSelection || frameSelection.rangeCount === 0 || frameSelection.isCollapsed) {
					continue;
				}
				return {
					selection: frameSelection,
					rectOffset: frame.getBoundingClientRect(),
				};
			} catch {
				// Ignore iframes that cannot be inspected.
			}
		}
		return null;
	}

	private getSelectionRect(selection: Selection, offset?: DOMRect): DOMRect | null {
		if (selection.rangeCount === 0) return null;

		const range = selection.getRangeAt(0);
		const rects = Array.from(range.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0);
		const baseRect = rects.length > 0 ? rects[rects.length - 1] : range.getBoundingClientRect();
		if (baseRect.width === 0 && baseRect.height === 0) return null;

		if (!offset) return baseRect;

		return new DOMRect(
			baseRect.x + offset.x,
			baseRect.y + offset.y,
			baseRect.width,
			baseRect.height,
		);
	}
}
