export async function readItemLabels(apiKey: string, imageUrls: string[]) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(40000),
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      temperature: 0,
      store: true,
      metadata: { feature: "ocr", product: "dealfinder-auctions" },
      max_tokens: 900,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are an OCR reader for auction lots. Read every printed, stamped, silk-screened, or stickered string on the OBJECT (not the room).
Pay extra attention to the back, base, battery door, FCC/IC sticker, hang tag, and any line that says Model, Type, P/N, Product, or MADE IN.
Copy characters exactly, including hyphens and letter/number mix (example: CUH-ZCT2U, CFI-ZCT1W).
Do not invent a marketing name (DualShock 4, DualSense, etc.) unless those words are printed.
Return JSON only.`,
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Transcribe all labels and model markings on this item. Look at every photo, especially stickers and rear text.",
            },
            ...imageUrls.slice(0, 4).map((url) => ({
              type: "image_url",
              image_url: { url, detail: "high" },
            })),
          ],
        },
      ],
    }),
  });
  const json = (await response.json()) as {
    id?: string;
    choices?: Array<{ message?: { content?: string } }>;
  };
  if (!response.ok) return { texts: [] as string[], modelLines: [] as string[], brandLines: [] as string[], id: "" };
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(json.choices?.[0]?.message?.content ?? "{}") as Record<string, unknown>;
  } catch {
    parsed = {};
  }
  const asList = (value: unknown) =>
    Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];
  return {
    texts: asList(parsed.all_text ?? parsed.texts),
    modelLines: asList(parsed.model_lines ?? parsed.model_numbers),
    brandLines: asList(parsed.brand_lines ?? parsed.brands),
    id: json.id ?? "",
  };
}
