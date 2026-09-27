import { NextRequest, NextResponse } from "next/server";
import { TURBO_SLOTH_MODEL, turboSlothSystemPrompt } from "@/lib/turboSloth";

export const runtime = "nodejs";

type ChatTurn = { role: "user" | "assistant"; content: string };

function turns(value: unknown): ChatTurn[] {
  if (!Array.isArray(value)) return [];
  const cleaned: ChatTurn[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const role = (item as { role?: unknown }).role;
    const content = String((item as { content?: unknown }).content ?? "").trim().slice(0, 1200);
    if ((role !== "user" && role !== "assistant") || !content) continue;
    cleaned.push({ role, content });
  }
  return cleaned.slice(-12);
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Turbo Sloth is offline. The desk has not set an AI key." }, { status: 500 });
  }

  const body = (await request.json().catch(() => ({}))) as { messages?: unknown };
  const messages = turns(body.messages);
  const latest = messages.at(-1);
  if (!latest || latest.role !== "user") {
    return NextResponse.json({ error: "Ask Turbo Sloth something first." }, { status: 400 });
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(25000),
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: TURBO_SLOTH_MODEL,
      temperature: 0.4,
      max_tokens: 350,
      messages: [{ role: "system", content: turboSlothSystemPrompt() }, ...messages],
    }),
  });
  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };
  if (!response.ok) {
    return NextResponse.json(
      { error: json.error?.message || "Turbo Sloth could not answer." },
      { status: 502 },
    );
  }
  const reply = json.choices?.[0]?.message?.content?.trim();
  if (!reply) {
    return NextResponse.json({ error: "Turbo Sloth had nothing to say." }, { status: 502 });
  }
  return NextResponse.json({ reply });
}
