export type ListingPhotoInput = File | string;

export type ListingPhotoPlan = {
  heroIndex: number;
  heroUrl: string;
  galleryUrls: string[];
  reason: string;
};

async function asDataUrl(photo: ListingPhotoInput): Promise<string | null> {
  if (typeof photo === "string") {
    const trimmed = photo.trim();
    return trimmed || null;
  }
  if (!(photo instanceof File) || photo.size <= 0) return null;
  const buffer = Buffer.from(await photo.arrayBuffer());
  const mime = photo.type || "image/jpeg";
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

function parseHeroIndex(raw: string, count: number) {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return 0;
  try {
    const parsed = JSON.parse(match[0]) as { heroIndex?: unknown; reason?: unknown };
    const index = Number(parsed.heroIndex);
    if (!Number.isInteger(index) || index < 0 || index >= count) return 0;
    return index;
  } catch {
    return 0;
  }
}

/**
 * Pick one hero photo for the paid studio edit. The rest stay as untouched gallery shots.
 */
export async function processListingPhotos(
  apiKey: string,
  photos: ListingPhotoInput[],
): Promise<ListingPhotoPlan> {
  const urls = (await Promise.all(photos.slice(0, 4).map(asDataUrl))).filter((url): url is string => Boolean(url));
  if (urls.length === 0) {
    return { heroIndex: 0, heroUrl: "", galleryUrls: [], reason: "No photos." };
  }
  if (urls.length === 1) {
    return { heroIndex: 0, heroUrl: urls[0], galleryUrls: urls, reason: "Only one photo." };
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(20000),
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0,
      max_tokens: 120,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Pick the single best product photo for a catalog hero shot. Judge lighting, framing, and how clearly the whole item is visible. Return JSON only: {\"heroIndex\": number, \"reason\": string}. heroIndex is 0-based.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: `There are ${urls.length} photos, in order from index 0. Return the best hero index.` },
            ...urls.map((url) => ({
              type: "image_url" as const,
              image_url: { url, detail: "low" as const },
            })),
          ],
        },
      ],
    }),
  });
  const json = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = json.choices?.[0]?.message?.content ?? "";
  const heroIndex = response.ok ? parseHeroIndex(raw, urls.length) : 0;
  return {
    heroIndex,
    heroUrl: urls[heroIndex] ?? urls[0],
    galleryUrls: urls,
    reason: response.ok ? "Best lit and framed shot." : "Vision pick failed; used the first photo.",
  };
}
