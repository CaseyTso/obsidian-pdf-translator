export function buildChatUrl(baseUrl: string): string {
	const trimmed = baseUrl.trim().replace(/\/+$/, "");
	if (trimmed.endsWith("/chat/completions")) return trimmed;
	return `${trimmed}/chat/completions`;
}

export function cleanModelOutput(value: string): string {
	return value
		.replace(/<think>[\s\S]*?<\/think>/gi, "")
		.replace(/^\s*(translation|translated text|译文|翻译)\s*[:：]\s*/i, "")
		.replace(/^```(?:text)?\s*/i, "")
		.replace(/```\s*$/i, "")
		.trim()
		.replace(/^["'“”]+|["'“”]+$/g, "")
		.replace(/\n{3,}/g, "\n\n")
		.trim(); // 剥首尾引号后再补一次 trim：引号内纯空白 → 空串，语义上干净
}

export function mapHttpError(status: number): string {
	if (status === 401) return "401：API key 无效或未授权";
	if (status === 429) return "429：额度不足或请求过于频繁";
	return `${status}：翻译服务暂时不可用`;
}
