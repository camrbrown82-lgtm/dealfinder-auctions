import { NextResponse } from "next/server";
import { CATEGORIES } from "@/lib/types";

const comicTitles = [
  "Halftone hammer lot",
  "Attic KAPOW stash",
  "Bagged-and-boarded surprise",
  "Pulp-shelf oddity",
  "Sunday-funnies crate",
];

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const imageUrls = Array.isArray(body.imageUrls) ? body.imageUrls.filter(Boolean) : [];
  if (!imageUrls.length && !body.allowEmpty) {
    return NextResponse.json({ error: "Provide at least one photo URL in imageUrls (or upload images)." }, { status: 400 });
  }

  const hint = String(body.titleHint || "").trim();
  const category =
    CATEGORIES.filter((row) => row !== "All").find((row) => hint.toLowerCase().includes(row.toLowerCase())) ||
    (["Comics", "Toys", "Vinyl", "Art", "Oddities"] as const)[Math.floor(Math.random() * 5)];
  const title = hint || `${comicTitles[Math.floor(Math.random() * comicTitles.length)]} — ${category}`;
  const description =
    body.description ||
    `Staff AI intake (demo). ${category} lot photographed for DealFinder. Bright under the lights, sold as-is, local pickup in Airdrie.`;
  const startingBid = 25 + Math.floor(Math.random() * 8) * 5;
  const reserve = startingBid * 2;
  const estimatedValue = reserve + 40;

  return NextResponse.json({
    title,
    description,
    category,
    startingBid,
    reserve,
    estimatedValue,
    source: process.env.OPENAI_API_KEY ? "openai-ready-demo-fallback" : "demo-intake",
  });
}
