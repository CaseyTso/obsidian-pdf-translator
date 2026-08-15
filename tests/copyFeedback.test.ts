import { afterEach, describe, expect, it, vi } from "vitest";
import { COPY_FEEDBACK_MS, CopyFeedbackController } from "../src/copyFeedback";

describe("CopyFeedbackController", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it("复制成功后切到 check，约 1.5 秒后恢复 copy", () => {
		vi.useFakeTimers();
		const states: string[] = [];
		const feedback = new CopyFeedbackController((state) => states.push(state));

		expect(feedback.getState()).toBe("copy");
		feedback.markCopied();
		expect(feedback.getState()).toBe("check");
		expect(states).toEqual(["check"]);

		vi.advanceTimersByTime(COPY_FEEDBACK_MS - 1);
		expect(feedback.getState()).toBe("check");

		vi.advanceTimersByTime(1);
		expect(feedback.getState()).toBe("copy");
		expect(states).toEqual(["check", "copy"]);
		feedback.destroy();
	});

	it("连续复制会重置计时", () => {
		vi.useFakeTimers();
		const feedback = new CopyFeedbackController(() => undefined);

		feedback.markCopied();
		vi.advanceTimersByTime(1000);
		feedback.markCopied();
		vi.advanceTimersByTime(1000);
		expect(feedback.getState()).toBe("check");
		vi.advanceTimersByTime(500);
		expect(feedback.getState()).toBe("copy");
		feedback.destroy();
	});

	it("destroy 清除未触发的恢复计时器", () => {
		vi.useFakeTimers();
		const states: string[] = [];
		const feedback = new CopyFeedbackController((state) => states.push(state));

		feedback.markCopied();
		feedback.destroy();
		vi.advanceTimersByTime(COPY_FEEDBACK_MS);
		expect(states).toEqual(["check"]);
		expect(feedback.getState()).toBe("check");
	});
});
