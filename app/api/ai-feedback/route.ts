import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import type { AiFeature } from "@/lib/aiRuns";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY is not set." }, { status: 500 });
  }

  const body = (await request.json()) as {
    rating?: "good" | "bad";
    comment?: string;
    summary?: string;
    ids?: string[];
    features?: AiFeature[];
  };

  if (body.rating !== "good" && body.rating !== "bad") {
    return NextResponse.json({ error: "Choose Looks good or Needs work." }, { status: 400 });
  }

  const ids = Array.isArray(body.ids) ? body.ids.filter(Boolean).slice(0, 8) : [];
  const features = Array.isArray(body.features) ? body.features.slice(0, 4) : [];
  const comment = (body.comment ?? "").trim().slice(0, 800);
  const summary = (body.summary ?? "").trim().slice(0, 1200);

  const openai = new OpenAI({ apiKey });
  try {
    await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      store: true,
      metadata: {
        kind: "human_feedback",
        rating: body.rating,
        features: features.join(",") || "unknown",
        target_ids: ids.join(",").slice(0, 512),
      },
      max_tokens: 40,
      messages: [
        {
          role: "system",
          content:
            "You log human feedback on DealFinder Auctions AI cataloging. Reply with one short acknowledgement only.",
        },
        {
          role: "user",
          content: [
            `Rating: ${body.rating}`,
            features.length ? `Features: ${features.join(", ")}` : "",
            ids.length ? `Target generation ids: ${ids.join(", ")}` : "",
            summary ? `AI output summary: ${summary}` : "",
            comment ? `Staff/consignor note: ${comment}` : "",
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "OpenAI feedback failed";
    return NextResponse.json({ error: message.replace(/sk-[A-Za-z0-9_\-]+/g, "sk-...") }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
