import { NextRequest, NextResponse } from "next/server";
import { isAdminSession, unauthorized } from "@/lib/adminAuth";
import { decideCashBidAuth, listPendingCashAuthRequests, setTrustedCashUser } from "@/lib/auctionRegistrations";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isAdminSession()) return unauthorized();
  const requests = await listPendingCashAuthRequests();
  return NextResponse.json({ requests });
}

export async function PATCH(request: NextRequest) {
  if (!isAdminSession()) return unauthorized();
  const body = (await request.json()) as {
    userId?: string;
    eventId?: string;
    decision?: "approve_auction" | "approve_permanent" | "reject";
    trustedCash?: boolean;
  };
  if (body.userId && typeof body.trustedCash === "boolean" && !body.decision) {
    await setTrustedCashUser(body.userId, body.trustedCash);
    return NextResponse.json({ ok: true });
  }
  if (!body.userId || !body.eventId || !body.decision) {
    return NextResponse.json({ error: "userId, eventId, and decision are required." }, { status: 400 });
  }
  const row = await decideCashBidAuth(body.userId, body.eventId, body.decision);
  return NextResponse.json({ ok: true, row });
}
