import { NextRequest, NextResponse } from "next/server";
import {
  approveHelcimBidAuth,
  evaluateBidAuth,
  requestCashBidAuth,
} from "@/lib/auctionRegistrations";
import { auctionTermsPack } from "@/lib/auctionTerms";
import { getBidderSession, bidderUnauthorized } from "@/lib/bidderAuth";
import { getAdminDemo } from "@/lib/demoAdminStore";
import { isHelcimConfigured } from "@/lib/helcim";
import { mapAuctionEvent } from "@/lib/mapAuctionEvent";
import {
  sendCashBidAuthEmail,
  sendCashBidReceivedEmail,
} from "@/lib/notify";
import { isProfileComplete } from "@/lib/profileTypes";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabaseClient";
import type { AuctionEvent } from "@/lib/utils";

export const dynamic = "force-dynamic";

async function loadEvent(eventId: string): Promise<AuctionEvent | null> {
  const supabase = getSupabaseAdmin();
  if (isSupabaseConfigured && supabase) {
    const { data } = await supabase.from("auction_events").select("*").eq("id", eventId).maybeSingle();
    if (data) return mapAuctionEvent(data as Parameters<typeof mapAuctionEvent>[0]);
  }
  return getAdminDemo().events.find((event) => event.id === eventId) ?? null;
}

export async function POST(request: NextRequest) {
  const session = await getBidderSession();
  if (!session) return bidderUnauthorized();
  if (!isProfileComplete(session)) {
    return NextResponse.json({ error: "Finish your bidder profile before authorizing." }, { status: 400 });
  }
  const body = (await request.json()) as { eventId?: string; method?: string };
  const eventId = body.eventId?.trim();
  if (!eventId) {
    return NextResponse.json({ error: "eventId is required." }, { status: 400 });
  }
  const event = await loadEvent(eventId);
  if (!event) {
    return NextResponse.json({ error: "Auction not found." }, { status: 404 });
  }

  if (body.method === "helcim") {
    if (!isHelcimConfigured()) {
      await approveHelcimBidAuth(session.id, eventId);
      const status = await evaluateBidAuth(session.id, eventId);
      return NextResponse.json({
        demo: true,
        ...status,
      });
    }
    return NextResponse.json({
      ok: true,
      needHelcim: true,
      demo: false,
    });
  }

  if (body.method === "cash") {
    const result = await requestCashBidAuth(session.id, eventId);
    if (!result.autoApproved) {
      const auctionLabel = [event.auctionNumber, event.name].filter(Boolean).join(" · ") || eventId;
      const requestedAt = result.row.preauthAgreedAt || new Date().toISOString();
      await sendCashBidAuthEmail({
        name: session.fullName,
        email: session.email,
        auctionLabel,
        eventId,
        requestedAt,
      });
      await sendCashBidReceivedEmail({
        to: session.email,
        name: session.fullName,
        auctionLabel,
      });
    }
    const status = await evaluateBidAuth(session.id, eventId);
    return NextResponse.json({
      cash: true,
      autoApproved: result.autoApproved,
      created: result.created,
      ...status,
      terms: auctionTermsPack(event),
    });
  }

  return NextResponse.json({ error: "Choose Helcim or cash." }, { status: 400 });
}
