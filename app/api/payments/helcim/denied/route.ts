import { NextRequest, NextResponse } from "next/server";
import { bidderUnauthorized, getBidderSession } from "@/lib/bidderAuth";
import { bidderSettlesInCash } from "@/lib/auctionRegistrations";
import { denySundayPreauth } from "@/lib/sundayPreauth";
import { forfeitLotWin } from "@/lib/forfeitBids";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const session = await getBidderSession();
  if (!session) return bidderUnauthorized();
  const body = (await request.json().catch(() => ({}))) as { lotId?: string; scope?: string };
  if (await bidderSettlesInCash(session.id)) {
    return NextResponse.json({ ok: true, forfeited: [], skipped: "cash" });
  }
  if (body.lotId && body.scope === "lot") {
    await forfeitLotWin(body.lotId);
    return NextResponse.json({ ok: true, forfeited: [{ id: body.lotId }] });
  }
  const lots = await denySundayPreauth(session.id, session.fullName);
  return NextResponse.json({ ok: true, forfeited: lots });
}
