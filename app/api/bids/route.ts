import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { listBids, placeBid } from "@/lib/store";

export async function GET(request: Request) {
  const lotId = new URL(request.url).searchParams.get("lotId");
  if (!lotId) return NextResponse.json({ error: "lotId is required" }, { status: 400 });
  const bids = await listBids(lotId);
  return NextResponse.json({ bids });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Log in to bid." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  try {
    const result = await placeBid({
      lotId: String(body.lotId || ""),
      user,
      mode: body.mode === "absentee" ? "absentee" : "live",
      amount: Number(body.amount),
      maxAmount: Number(body.maxAmount || body.amount),
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Bid failed." }, { status: 400 });
  }
}
