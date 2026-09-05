import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

const SYSTEM = `You catalog auction consignments from item photos.
Return JSON only with these keys:
- title (short lot title)
- description (2-4 sentences, factual, lot-ready)
- suggested_starting_bid (integer USD)
- estimated_market_value (integer USD)
Be conservative on starting bid (typically 40-70% of estimated market value).`;

function asInt(value: unknown, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.round(n);
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
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Catalog this consigned item from the photos.",
          },
          ...imageUrls.map((url) => ({
            type: "image_url" as const,
            image_url: { url },
          })),
        ],
      },
    ],
    response_format: { type: "json_object" },
    max_tokens: 500,
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    parsed = { description: raw };
  }

  return NextResponse.json({
    title: String(parsed.title ?? "Untitled lot"),
    description: String(parsed.description ?? ""),
    suggested_starting_bid: asInt(
      parsed.suggested_starting_bid ?? parsed.suggestedStartingBid,
      0,
    ),
    estimated_market_value: asInt(
      parsed.estimated_market_value ?? parsed.estimatedMarketValue,
      0,
    ),
  });
}
