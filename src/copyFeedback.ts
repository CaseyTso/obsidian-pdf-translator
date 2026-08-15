export const COPY_FEEDBACK_MS = 1500;

export type CopyFeedbackState = "copy" | "check";

export class CopyFeedbackController {
	private state: CopyFeedbackState = "copy";
	private resetTimer: ReturnType<typeof setTimeout> | undefined;
	private destroyed = false;

	constructor(private readonly onStateChange: (state: CopyFeedbackState) => void) {}

	getState(): CopyFeedbackState {
		return this.state;
	}

	markCopied(): void {
		if (this.destroyed) return;
		this.state = "check";
		this.onStateChange(this.state);
		if (this.resetTimer !== undefined) clearTimeout(this.resetTimer);
		this.resetTimer = setTimeout(() => {
			this.resetTimer = undefined;
			if (this.destroyed) return;
			this.state = "copy";
			this.onStateChange(this.state);
		}, COPY_FEEDBACK_MS);
	}

	destroy(): void {
		this.destroyed = true;
		if (this.resetTimer !== undefined) clearTimeout(this.resetTimer);
		this.resetTimer = undefined;
	}
}