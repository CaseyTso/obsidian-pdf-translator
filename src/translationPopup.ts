import { setIcon } from "obsidian";
import { CopyFeedbackController } from "./copyFeedback";
import { clampBoundsToWindow, clampPopupToBounds, computePopupPlacement, type PopupBox } from "./popupGeometry";
import type { PdfTextSelection } from "./types";

type PopupState = "loading" | "success" | "error";

interface PopupOptions {
	fontSize: number;
	onRetry: () => void;
}

export class TranslationPopup {
	private rootEl: HTMLElement;
	private actionsEl: HTMLElement;
	private resultEl: HTMLElement;
	private copyButton: HTMLButtonElement | null = null;
	private copyFeedback: CopyFeedbackController;
	private lastResult = "";
	private lastPopup: PopupBox | null = null;
	private options: PopupOptions;

	constructor(options: PopupOptions) {
		this.options = options;
		this.rootEl = activeDocument.body.createDiv({ cls: "pdf-translator-popup" });
		this.rootEl.hide();

		const bodyEl = this.rootEl.createDiv({ cls: "pdf-translator-popup__body" });
		this.resultEl = bodyEl.createDiv({ cls: "pdf-translator-popup__result" });
		this.resultEl.style.fontSize = `${options.fontSize}px`;

		this.actionsEl = this.rootEl.createDiv({ cls: "pdf-translator-popup__actions" });
		this.copyFeedback = new CopyFeedbackController((state) => {
			if (this.copyButton) setIcon(this.copyButton, state);
		});
		this.renderActions();
	}

	updateOptions(options: Partial<PopupOptions>): void {
		this.options = { ...this.options, ...options };
		this.resultEl.style.fontSize = `${this.options.fontSize}px`;
	}

	showLoading(selection: PdfTextSelection): void {
		this.lastResult = "";
		this.render("loading", "翻译中…");
		this.showAt(selection);
	}

	showResult(translatedText: string, selection: PdfTextSelection): void {
		this.lastResult = translatedText;
		this.render("success", translatedText);
		this.showAt(selection);
	}

	showError(message: string, selection: PdfTextSelection): void {
		this.lastResult = "";
		this.render("error", message);
		this.showAt(selection);
	}

	hide(): void {
		this.lastPopup = null;
		this.rootEl.hide();
	}

	reposition(bounds: DOMRect | null): void {
		if (!this.lastPopup || !bounds || this.rootEl.style.display === "none") return;
		const clamped = clampPopupToBounds(this.lastPopup, clampBoundsToWindow(toPopupBox(bounds), windowViewport()));
		this.lastPopup = clamped;
		this.applyPlacement(clamped);
	}

	containsTarget(target: EventTarget | null): boolean {
		return target instanceof Node && this.rootEl.contains(target);
	}

	destroy(): void {
		this.copyFeedback.destroy();
		this.rootEl.remove();
	}

	private render(state: PopupState, content: string): void {
		this.resultEl.setText(content);
		this.resultEl.toggleClass("pdf-translator-popup__loading", state === "loading");
		this.resultEl.toggleClass("pdf-translator-popup__error", state === "error");
		this.renderActions();
	}

	private renderActions(): void {
		this.actionsEl.empty();

		this.copyButton = this.createIconButton(this.copyFeedback.getState(), "复制译文");
		this.copyButton.disabled = !this.lastResult;
		this.copyButton.onClickEvent(async () => {
			if (this.lastResult) {
				await navigator.clipboard.writeText(this.lastResult);
				this.copyFeedback.markCopied();
			}
		});

		const retryButton = this.createIconButton("refresh-cw", "重新翻译");
		retryButton.onClickEvent(() => this.options.onRetry());
	}

	private createIconButton(icon: string, label: string): HTMLButtonElement {
		const button = this.actionsEl.createEl("button", {
			cls: "pdf-translator-popup__button",
			attr: { "aria-label": label, title: label },
		});
		button.onpointerdown = (event) => event.preventDefault();
		setIcon(button, icon);
		return button;
	}

	private showAt(selection: PdfTextSelection): void {
		const bounds = clampBoundsToWindow(toPopupBox(selection.pdfBounds), windowViewport());
		this.rootEl.style.maxHeight = `${bounds.height * 0.45}px`;
		this.rootEl.style.height = "";
		this.rootEl.show();
		const placement = computePopupPlacement({
			selection: toPopupBox(selection.rect),
			bounds,
			contentHeight: this.rootEl.getBoundingClientRect().height,
		});
		this.lastPopup = placement;
		this.applyPlacement(placement);
	}

	private applyPlacement(placement: PopupBox): void {
		this.rootEl.style.left = `${placement.left}px`;
		this.rootEl.style.top = `${placement.top}px`;
		this.rootEl.style.width = `${placement.width}px`;
		this.rootEl.style.height = `${placement.height}px`;
	}
}

function toPopupBox(rect: DOMRect): PopupBox {
	return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

function windowViewport(): PopupBox {
	return { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
}
