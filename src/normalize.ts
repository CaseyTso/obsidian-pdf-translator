export const MAX_SELECTION_CHARS = 5000;

export function normalizeSelectionText(value: string): string {
	const normalized = value
		.replace(/\r\n?/g, "\n")
		.replace(/\u00a0/g, " ")
		.replace(/[ \t]+/g, " ")
		.replace(/([A-Za-zÀ-ÖØ-öø-ÿ])-\n(?=[A-Za-zÀ-ÖØ-öø-ÿ])/g, "$1")
		.replace(/([\u3040-\u30ff\u3400-\u9fff])\n(?=[\u3040-\u30ff\u3400-\u9fff])/g, "$1")
		.replace(/\n{2,}/g, "\n\n")
		.trim();

	return normalized
		.split(/\n\n+/)
		.map((paragraph) => paragraph.replace(/\s*\n\s*/g, " ").replace(/[ \t]{2,}/g, " ").trim())
		.filter(Boolean)
		.join("\n\n");
}

export function isValidSelection(rawText: string): boolean {
	const text = rawText.trim();
	if (!text) return false;
	if (!/[\p{L}]/u.test(text)) return false; // 至少一个字母/汉字
	if (text.length > MAX_SELECTION_CHARS) return false;
	return true;
}
