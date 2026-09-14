import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { priceFromMarketComps } from "@/lib/marketComps";
import { identifyLotProduct } from "@/lib/identifyProduct";
import { catalogTitle, resolveModel } from "@/lib/lotIdentity";
import { readItemLabels } from "@/lib/readItemLabels";

export const runtime = "nodejs";
export const maxDuration = 120;

const SYSTEM = `You are an auction cataloger identifying ONE consigned lot from photos.

Product identity must be repeatable: the same object photographed twice must get the same maker/model.
- Transcribe logos and printed model text exactly. visible_text is the source of truth.
- Do NOT guess a model, generation, SKU, or revision (e.g. DualShock 3 vs 4 vs 5) unless that exact string is readable on the item.
- If maker is clear from a logo but model is not printed, leave model out of the title. Title = maker + object type only.
- Ignore rooms, tables, hands, clutter, and serial/barcode numbers for naming.
- Description: what the object is and visible condition. Do not narrate the snapshot.
- display_setting: studio set that suits this object type.
- Do not estimate prices.

Return JSON with:
{
  "visible_text": string[],
  "object_type": string,
  "maker": string,
  "model": string,
  "materials": string[],
  "condition": string,
  "uncertainties": string[],
  "title": string,
  "description": string,
  "display_setting": string,
  "photo_brief": string,
  "suggested_starting_bid": 0,
  "estimated_market_value": 0
}`;

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item).trim())
    .filter(Boolean)
    .slice(0, 40);
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
  const labels = await readItemLabels(apiKey, imageUrls).catch(() => ({
    texts: [] as string[],
    modelLines: [] as string[],
    brandLines: [] as string[],
    id: "",
  }));
  const labelDump = [...labels.brandLines, ...labels.modelLines, ...labels.texts]
    .filter(Boolean)
    .slice(0, 40);
  const labelBlock = labelDump.length
    ? `Label OCR (copy these into visible_text; use model_lines as the model if present):\n${labelDump.join("\n")}`
    : "No separate OCR pass text. Read stickers and rear labels in the photos yourself.";

  let completion;
  try {
    completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0,
      store: true,
      metadata: { feature: "catalog", product: "dealfinder-auctions" },
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Read every label. ${labelBlock}\nName the lot from those markings. Do not guess a generation that is not printed.`,
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

  const visibleText = Array.from(
    new Set([...labelDump, ...asStringList(parsed.visible_text), ...labels.modelLines]),
  );
  let maker = String(parsed.maker ?? labels.brandLines[0] ?? "").trim();
  let model = resolveModel(String(parsed.model ?? ""), visibleText);
  let objectType = String(parsed.object_type ?? "").trim();
  let title = catalogTitle({ maker, model, objectType }) || String(parsed.title ?? "").trim() || "Untitled lot";
  let description = composeDescription(parsed);
  let displaySetting = String(parsed.display_setting ?? "").trim();
  let photoBrief = String(parsed.photo_brief ?? "").trim();
  const identifyIds: string[] = [];

  try {
    const identified = await identifyLotProduct(apiKey, imageUrls, {
      title,
      objectType,
      visibleText,
      materials: asStringList(parsed.materials),
      condition: String(parsed.condition ?? "").trim(),
      uncertainties: asStringList(parsed.uncertainties),
    });
    if (identified) {
      if (identified.openaiId) identifyIds.push(identified.openaiId);
      if (identified.maker) maker = identified.maker;
      model = resolveModel(identified.model, visibleText);
      title = catalogTitle({ maker, model, objectType }) || identified.title || title;
      if (identified.description) description = identified.description;
      if (identified.displaySetting) displaySetting = identified.displaySetting;
      if (identified.photoBrief) photoBrief = identified.photoBrief;
    }
  } catch {
    /* keep first-pass catalog */
  }

  title = catalogTitle({ maker, model, objectType }) || title;
  model = resolveModel(model, visibleText);
  title = catalogTitle({ maker, model, objectType }) || title;

  let pricing = {
    estimated_market_value: 0,
    suggested_reserve: 0,
    suggested_starting_bid: 0,
    comps_note: "Could not load public comps; enter prices by hand.",
    openaiIds: [] as string[],
  };
  try {
    pricing = await priceFromMarketComps(apiKey, {
      title,
      maker,
      model,
      objectType,
      visibleText,
      condition: String(parsed.condition ?? "").trim(),
      uncertainties: asStringList(parsed.uncertainties),
    });
  } catch {
    /* keep conservative empty pricing */
  }

  if (!photoBrief) {
    photoBrief = `Generate a new square auction listing photograph of ${title}, full object, three-quarter view, cream paper sweep, no warehouse background.`;
  }

  return NextResponse.json({
    title,
    description,
    object_type: objectType,
    materials: asStringList(parsed.materials),
    condition: String(parsed.condition ?? "").trim(),
    display_setting: displaySetting,
    photo_brief: photoBrief,
    suggested_starting_bid: pricing.suggested_starting_bid,
    estimated_market_value: pricing.estimated_market_value,
    suggested_reserve: pricing.suggested_reserve,
    comps_note: pricing.comps_note,
    ai: {
      ids: [labels.id, completion.id, ...identifyIds, ...(pricing.openaiIds ?? [])].filter(Boolean),
      features: ["catalog", "comps"],
    },
  });
}
