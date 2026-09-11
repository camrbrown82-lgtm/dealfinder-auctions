import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/session";
import { getStore, listBids, voidBid } from "@/lib/store";

export async function GET(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Admin login required." }, { status: 401 });
  const lotId = new URL(request.url).searchParams.get("lotId");
  if (!lotId) return NextResponse.json({ error: "lotId is required" }, { status: 400 });
  const bids = await listBids(lotId);
  const data = await getStore();
  const all = data.bids.filter((bid) => bid.lotId === lotId).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return NextResponse.json({ bids: all.length ? all : bids });
}

export async function POST(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Admin login required." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  try {
    const result = await voidBid(String(body.bidId));
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not void bid." }, { status: 400 });
  }
}
