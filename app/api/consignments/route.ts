import { NextResponse } from "next/server";
import { createLot, listConsignments } from "@/lib/store";
import type { Category } from "@/lib/types";

export async function GET(request: Request) {
  const consignor = new URL(request.url).searchParams.get("consignor") || undefined;
  const lots = await listConsignments(consignor);
  return NextResponse.json({ lots });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const consignor = String(body.consignor || "").trim();
  const title = String(body.title || "").trim();
  if (!consignor || !title) {
    return NextResponse.json({ error: "Consignor name and title are required." }, { status: 400 });
  }
  try {
    const lot = await createLot({
      title,
      consignor,
      description: String(body.description || ""),
      category: (body.category as Category) || "Oddities",
      startingBid: Number(body.startingBid || 0),
      currentBid: Number(body.startingBid || 0),
      reserve: Number(body.reserve || 0),
      estimatedValue: Number(body.estimatedValue || 0),
      images: Array.isArray(body.images) ? body.images : [],
      status: "pending_approval",
      pipelineStatus: "pending_approval",
      goLive: false,
    });
    return NextResponse.json({ lot });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Submit failed" }, { status: 400 });
  }
}
