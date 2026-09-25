import { NextRequest, NextResponse } from "next/server";
import { isAdminSession, unauthorized } from "@/lib/adminAuth";
import { decideCashBidAuth, listPendingCashAuthRequests, setTrustedCashUser } from "@/lib/auctionRegistrations";
import { sendCashBidDecisionEmail } from "@/lib/notify";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabaseClient";

export const dynamic = "force-dynamic";

async function bidderMail(userId: string, eventId: string) {
  const supabase = getSupabaseAdmin();
  if (!isSupabaseConfigured || !supabase) return { email: "", name: "", auctionLabel: eventId };
  const [{ data: profile }, { data: event }] = await Promise.all([
    supabase.from("profiles").select("email, full_name").eq("id", userId).maybeSingle(),
    supabase.from("auction_events").select("name, auction_number").eq("id", eventId).maybeSingle(),
  ]);
  const auctionLabel = [event?.auction_number, event?.name].filter(Boolean).join(" · ") || eventId;
  return {
    email: String(profile?.email ?? ""),
    name: String(profile?.full_name ?? ""),
    auctionLabel,
  };
}

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
  const mail = await bidderMail(body.userId, body.eventId);
  if (mail.email) {
    await sendCashBidDecisionEmail({
      to: mail.email,
      name: mail.name,
      auctionLabel: mail.auctionLabel,
      approved: body.decision !== "reject",
      permanent: body.decision === "approve_permanent",
    });
  }
  return NextResponse.json({ ok: true, row });
}
