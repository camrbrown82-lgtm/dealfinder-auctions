import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { priceFromMarketComps } from "@/lib/marketComps";

export const runtime = "nodejs";
export const maxDuration = 120;

const SYSTEM = `You are a conservative auction-house cataloger. Identify ONE consigned lot from photos.

Accuracy rules:
- Describe only what is visible. Do not invent brand, maker, artist, year, edition, model number, rarity, origin, or authenticity unless that text is readable on the item, tag, label, or packaging.
- If you cannot confirm a fact, leave it out of the title and put it in uncertainties. Never guess to sound complete.
- Ignore background rooms, furniture, people, and other objects that are not the lot.
- Multiple photos are the same lot from different angles. Reconcile them; do not catalog each photo as a different item.
- Transcribe readable text, stamps, hallmarks, serials, and labels exactly, including misspellings.
- Condition: only chips, cracks, stains, wear, fading, or repairs you can actually see.
- Title: short, specific, no hype. Do not use rare/vintage/antique/mint unless those words appear on the item or the object type is unmistakable.
- Description: 2-5 factual lot sentences. Auction tone. No marketing.
- Do not estimate prices. Set suggested_starting_bid and estimated_market_value to 0. Pricing is done from public comps in a later step.

Return JSON with:
{
  "visible_text": string[] (exact transcriptions, empty if none),
  "object_type": string (plain object, e.g. "ceramic mug"),
  "materials": string[] (only if visible),
  "condition": string,
  "uncertainties": string[] (brands, dates, etc. you could not confirm),
  "title": string,
  "description": string,
  "display_setting": string (short set that fits the object, e.g. "walnut record shelf" or "plain cream paper sweep"),
  "suggested_starting_bid": 0,
  "estimated_market_value": 0
}
Do not invent a dollar value.`;

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item).trim())
    .filter(Boolean)
    .slice(0, 12);
}

function composeDescription(parsed: Record<string, unknown>): string {
  let description = String(parsed.description ?? "").trim();
  const objectType = String(parsed.object_type ?? "").trim();
  const materials = asStringList(parsed.materials);
  const condition = String(parsed.condition ?? "").trim();
  const visibleText = asStringList(parsed.visible_text);
  const uncertainties = asStringList(parsed.uncertainties);

  if (!description) {
    const parts = [
      objectType ? `Appears to be a ${objectType}.` : "",
      materials.length ? `Visible materials: ${materials.join(", ")}.` : "",
      visibleText.length ? `Readable markings: ${visibleText.join("; ")}.` : "",
      condition ? `Condition: ${condition}.` : "",
    ].filter(Boolean);
    description = parts.join(" ");
  } else {
    if (visibleText.length && !visibleText.some((text) => description.includes(text))) {
      description += ` Readable markings: ${visibleText.join("; ")}.`;
    }
    if (condition && !description.toLowerCase().includes("condition")) {
      description += ` Condition: ${condition}.`;
    }
  }

  if (uncertainties.length) {
    description += ` Unconfirmed from photos: ${uncertainties.join("; ")}.`;
  }

  return description.trim();
}

async function collectImageUrls(request: NextRequest): Promise<string[]> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = (await request.json()) as { imageUrls?: unknown; photoUrls?: unknown };
    const list = body.imageUrls ?? body.photoUrls ?? [];
    return Array.isArray(list) ? list.map(String).filter(Boolean) : [];
  }

  const form = await request.formData();
  const fromFields = form
    .getAll("imageUrls")
    .concat(form.getAll("photoUrls"))
    .map(String)
    .filter(Boolean);

  const files = form
    .getAll("images")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);

  const fromFiles = await Promise.all(
    files.slice(0, 4).map(async (file) => {
      const buffer = Buffer.from(await file.arrayBuffer());
      const mime = file.type || "image/jpeg";
      return `data:${mime};base64,${buffer.toString("base64")}`;
    }),
  );

  return [...fromFields, ...fromFiles].slice(0, 4);
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not set in .env.local" },
      { status: 500 },
    );
  }

  const imageUrls = await collectImageUrls(request);
  if (imageUrls.length === 0) {
    return NextResponse.json(
      { error: "Provide at least one photo URL in imageUrls (or upload images)." },
      { status: 400 },
    );
  }

  const openai = new OpenAI({ apiKey });
  let completion;
  try {
    completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.1,
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "Catalog this consigned lot. First read any visible text and markings, then describe only the object in the photos. Do not fill gaps with guesses.",
            },
            ...imageUrls.map((url) => ({
              type: "image_url" as const,
              image_url: { url, detail: "high" as const },
            })),
          ],
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 900,
    });
  } catch (err) {
    const status =
      typeof err === "object" && err && "status" in err
        ? Number((err as { status: number }).status)
        : 500;
    const rawMessage = err instanceof Error ? err.message : "OpenAI request failed";
    const message = rawMessage
      .replace(/sk-[A-Za-z0-9_\-]+/g, "sk-...")
      .replace(/Incorrect API key provided:.*/i, "Incorrect API key. Put a valid OPENAI_API_KEY in .env.local (and Vercel).");
    return NextResponse.json(
      { error: message },
      { status: status >= 400 && status < 600 ? status : 500 },
    );
  }

  const raw = completion.choices[0]?.message?.content ?? "{}";
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    parsed = { description: raw };
  }

  const title =
    String(parsed.title ?? "").trim() ||
    String(parsed.object_type ?? "").trim() ||
    "Untitled lot";
  const description = composeDescription(parsed);

  let pricing = {
    estimated_market_value: 0,
    suggested_reserve: 0,
    suggested_starting_bid: 0,
    comps_note: "Could not load public comps; enter prices by hand.",
  };
  try {
    pricing = await priceFromMarketComps(apiKey, {
      title,
      objectType: String(parsed.object_type ?? "").trim(),
      visibleText: asStringList(parsed.visible_text),
      condition: String(parsed.condition ?? "").trim(),
      uncertainties: asStringList(parsed.uncertainties),
    });
  } catch {
    /* keep conservative empty pricing */
  }

  return NextResponse.json({
    title,
    description,
    object_type: String(parsed.object_type ?? "").trim(),
    materials: asStringList(parsed.materials),
    condition: String(parsed.condition ?? "").trim(),
    display_setting: String(parsed.display_setting ?? "").trim(),
    suggested_starting_bid: pricing.suggested_starting_bid,
    estimated_market_value: pricing.estimated_market_value,
    suggested_reserve: pricing.suggested_reserve,
    comps_note: pricing.comps_note,
  });
}
