export type ProductIdentity = {
  title: string;
  description: string;
  identifiedAs: string;
  maker: string;
  model: string;
  color: string;
  displaySetting: string;
  photoBrief: string;
  openaiId: string;
};

function parseJsonObject(raw: string): Record<string, unknown> {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return {};
  try {
    return JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function outputText(data: Record<string, unknown>) {
  const chunks: string[] = [];
  if (typeof data.output_text === "string") chunks.push(data.output_text);
  for (const item of (data.output as Array<Record<string, unknown>> | undefined) ?? []) {
    for (const content of (item.content as Array<Record<string, unknown>> | undefined) ?? []) {
      if (typeof content.text === "string") chunks.push(content.text);
    }
  }
  return chunks.join("\n");
}

export async function identifyLotProduct(
  apiKey: string,
  imageUrls: string[],
  clues: {
    title: string;
    objectType: string;
    visibleText: string[];
    materials: string[];
    condition: string;
    uncertainties: string[];
  },
): Promise<ProductIdentity | null> {
  const prompt = `Name this ONE consigned lot from the photos. Be identical every time the same object is photographed.

Vision clues:
- First-pass title: ${clues.title}
- Object type: ${clues.objectType || "unknown"}
- Readable markings (use these for model): ${clues.visibleText.join("; ") || "none"}
- Materials: ${clues.materials.join(", ") || "unspecified"}
- Condition: ${clues.condition || "unknown"}
- Uncertain: ${clues.uncertainties.join("; ") || "none"}

Rules:
- maker: brand from a visible logo/wordmark only.
- model: copy printed model text only. Empty string if the model/generation is not readable. Do not choose DualShock 3/4/5, Slim vs Pro, etc. from memory or similar listings.
- title: specific catalog line with maker, product, confirmed part/model code, and color if visible. Not vague ("controller", "electronic item").
- description: 4–6 auction sentences covering identity, color/finish, visible features, printed markings, what is included, and condition. Not a snapshot walkthrough.
- display_setting: a lived-in catalog scene that fits the object (lamp on a wooden side table, not a blank sweep).
- photo_brief: place this exact object in that scene.

Return JSON only:
{
  "identified_as": string,
  "maker": string,
  "model": string,
  "color": string,
  "title": string,
  "description": string,
  "display_setting": string,
  "photo_brief": string
}`;

  const content: Array<Record<string, unknown>> = [{ type: "input_text", text: prompt }];
  for (const url of imageUrls.slice(0, 4)) {
    content.push({ type: "input_image", image_url: url, detail: "high" });
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    signal: AbortSignal.timeout(40000),
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      store: true,
      metadata: { feature: "identify", product: "dealfinder-auctions" },
      temperature: 0,
      text: { format: { type: "json_object" } },
      input: [{ role: "user", content }],
    }),
  });
  const json = (await response.json()) as Record<string, unknown>;
  if (!response.ok) return null;
  const parsed = parseJsonObject(outputText(json));
  const title = String(parsed.title ?? "").trim();
  const description = String(parsed.description ?? "").trim();
  if (!title && !description) return null;
  return {
    title: title || clues.title,
    description,
    identifiedAs: String(parsed.identified_as ?? "").trim(),
    maker: String(parsed.maker ?? "").trim(),
    model: String(parsed.model ?? "").trim(),
    color: String(parsed.color ?? "").trim(),
    displaySetting: String(parsed.display_setting ?? "").trim(),
    photoBrief: String(parsed.photo_brief ?? "").trim(),
    openaiId: typeof json.id === "string" ? json.id : "",
  };
}
