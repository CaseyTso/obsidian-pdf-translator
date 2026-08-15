const GOOGLE_ENDPOINT = "https://translate.googleapis.com/translate_a/single";

export function parseGoogleResponse(body: unknown): string {
	const segments = (body as unknown[])?.[0] as Array<Array<unknown> | null> | undefined;
	let translatedText = "";
	if (Array.isArray(segments)) {
		for (const segment of segments) {
			if (segment && typeof segment[0] === "string") {
				translatedText += segment[0];
			}
		}
	}
	return translatedText.trim();
}

export function buildGoogleUrl(targetLang: string, text: string): string {
	const params = new URLSearchParams({
		client: "gtx",
		sl: "auto",
		tl: targetLang,
		dt: "t",
		q: text,
	});
	return `${GOOGLE_ENDPOINT}?${params.toString()}`;
}
