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
- Title: specific auction catalog line: maker + product name + confirmed part/model code + color/finish if visible. Example: "Sony DualSense Wireless Controller CFI-ZCT1W White". Never a vague "game controller" or "item in photo".
- Description: 4–6 auction sentences: what it is, color/finish, visible features (ports, analog sticks, cable), printed model/part numbers from labels, accessories included in the photos, and condition. Do not narrate the room or the snapshot.
- Do not suggest buy-now, reserve, or starting prices. House and consignor set those.

Return JSON with:
{
  "visible_text": string[],
  "object_type": string,
  "maker": string,
  "model": string,
  "materials": string[],
  "condition": string,
  "uncertainties": string[],
  "color": string,
  "included": string[],
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

function composeDescription(parsed: Record<string, unknown>, extras?: { maker?: string; model?: string; color?: string }) {
  const objectType = String(parsed.object_type ?? "").trim();
  const materials = asStringList(parsed.materials);
  const condition = String(parsed.condition ?? "").trim();
  const visibleText = asStringList(parsed.visible_text);
  const included = asStringList(parsed.included);
  const color = String(extras?.color ?? parsed.color ?? "").trim();
  const maker = String(extras?.maker ?? parsed.maker ?? "").trim();
  const model = String(extras?.model ?? parsed.model ?? "").trim();
  let description = String(parsed.description ?? "").trim();

  if (!description || description.split(/\s+/).length < 28) {
    const who = [maker, model, color, objectType].filter(Boolean).join(" ");
    const parts = [
      who ? `${who} offered as one auction lot.` : "",
      color && !who.toLowerCase().includes(color.toLowerCase()) ? `Finish appears ${color}.` : "",
      materials.length ? `Visible materials: ${materials.join(", ")}.` : "",
      included.length ? `Included in the photos: ${included.join(", ")}.` : "",
      visibleText.length ? `Printed markings: ${visibleText.slice(0, 8).join("; ")}.` : "",
      condition ? `Condition: ${condition}.` : "",
    ].filter(Boolean);
    description = parts.join(" ");
  } else {
    if (visibleText.length && !visibleText.some((text) => description.includes(text))) {
      description += ` Printed markings: ${visibleText.slice(0, 8).join("; ")}.`;
    }
    if (condition && !description.toLowerCase().includes("condition")) {
      description += ` Condition: ${condition}.`;
    }
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
  let color = String(parsed.color ?? "").trim();
  let title =
    catalogTitle({ maker, model, objectType, color }) ||
    String(parsed.title ?? "").trim() ||
    "Untitled lot";
  let description = composeDescription(parsed, { maker, model, color });
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
      if (identified.color) color = identified.color;
      model = resolveModel(identified.model, visibleText);
      const built = catalogTitle({ maker, model, objectType, color });
      const named = identified.title.trim();
      const modelHint = model.split(/\s+/).pop()?.toLowerCase() ?? "";
      title =
        named.length > (built?.length ?? 0) &&
        (!modelHint || named.toLowerCase().includes(modelHint) || named.toLowerCase().includes(maker.toLowerCase()))
          ? named
          : built || named || title;
      if (identified.description && identified.description.split(/\s+/).length >= 28) {
        description = identified.description;
      } else {
        description = composeDescription(
          { ...parsed, description: identified.description || parsed.description },
          { maker, model, color },
        );
      }
      if (identified.displaySetting) displaySetting = identified.displaySetting;
      if (identified.photoBrief) photoBrief = identified.photoBrief;
    }
  } catch {
    /* keep first-pass catalog */
  }

  model = resolveModel(model, visibleText);
  title = catalogTitle({ maker, model, objectType, color }) || title;
  description = composeDescription({ ...parsed, description }, { maker, model, color });

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
    suggested_starting_bid: 0,
    estimated_market_value: pricing.estimated_market_value,
    suggested_reserve: 0,
    comps_note: pricing.comps_note,
    ai: {
      ids: [labels.id, completion.id, ...identifyIds, ...(pricing.openaiIds ?? [])].filter(Boolean),
      features: ["catalog", "comps"],
    },
  });
}
