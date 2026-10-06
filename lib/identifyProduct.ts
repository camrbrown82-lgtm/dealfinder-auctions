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

export async function identifyLotProduct(
  apiKey: string,
  clues: {
    title: string;
    objectType: string;
    visibleText: string[];
    materials: string[];
    condition: string;
    itemDetails?: string;
    listingGrade?: string;
    uncertainties: string[];
  },
): Promise<ProductIdentity | null> {
  const prompt = `Check this consigned lot against the markings already read from the photos. Be identical every time the same object is cataloged.

Vision clues already transcribed:
- First-pass title: ${clues.title}
- Object type: ${clues.objectType || "unknown"}
- Readable markings (use these for model): ${clues.visibleText.join("; ") || "none"}
- Materials: ${clues.materials.join(", ") || "unspecified"}
- Condition: ${clues.condition || "unknown"}
- Listing grade: ${clues.listingGrade || "Used"}
- Staff/consignor notes (size, extras, defects): ${clues.itemDetails || "none"}
- Uncertain: ${clues.uncertainties.join("; ") || "none"}

Rules:
- maker: brand only if it appears in the readable markings or the first-pass title.
- model: copy printed model text only. Empty string if the model/generation is not in the readable markings. Do not choose DualShock 3/4/5, Slim vs Pro, etc. from memory.
- title: specific catalog line with maker, product, confirmed part/model code, and color if visible. Not vague ("controller", "electronic item").
- description: 4–6 auction sentences covering identity, color/finish, visible features, printed markings, what is included, size from notes, and condition. Use the listing grade. Not a snapshot walkthrough.
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

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(40000),
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4.1",
      temperature: 0,
      store: true,
      metadata: { feature: "identify", product: "dealfinder-auctions" },
      max_tokens: 900,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You check auction catalog identity against transcribed labels. Do not invent a model that is not in the readable markings. Return JSON only.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });
  const json = (await response.json()) as {
    id?: string;
    choices?: Array<{ message?: { content?: string } }>;
  };
  if (!response.ok) return null;
  const parsed = parseJsonObject(json.choices?.[0]?.message?.content ?? "");
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
    openaiId: json.id ?? "",
  };
}
