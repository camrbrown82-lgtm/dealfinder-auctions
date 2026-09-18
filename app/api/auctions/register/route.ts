import { NextRequest, NextResponse } from "next/server";
import { auctionTermsPack } from "@/lib/auctionTerms";
import { saveAuctionRegistration, evaluateBidAuth } from "@/lib/auctionRegistrations";
import { getBidderSession, bidderUnauthorized } from "@/lib/bidderAuth";
import { getAdminDemo } from "@/lib/demoAdminStore";
import { mapAuctionEvent } from "@/lib/mapAuctionEvent";
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

export async function GET(request: NextRequest) {
  const session = await getBidderSession();
  if (!session) return bidderUnauthorized();
  const eventId = request.nextUrl.searchParams.get("eventId")?.trim();
  if (!eventId) {
    return NextResponse.json({ error: "eventId is required" }, { status: 400 });
  }
  const event = await loadEvent(eventId);
  if (!event) {
    return NextResponse.json({ error: "Auction not found" }, { status: 404 });
  }
  const auth = await evaluateBidAuth(session.id, eventId);
  return NextResponse.json({
    registered: auth.registered,
    authorized: auth.authorized,
    authStatus: auth.authStatus,
    paymentMethod: auth.paymentMethod,
    trustedCash: auth.trustedCash,
    preauthHeld: auth.preauthHeld,
    terms: auctionTermsPack(event),
  });
}

export async function POST(request: NextRequest) {
  const session = await getBidderSession();
  if (!session) return bidderUnauthorized();
  if (!isProfileComplete(session)) {
    return NextResponse.json({ error: "Finish your bidder profile before agreeing." }, { status: 400 });
  }
  const body = (await request.json()) as {
    eventId?: string;
    termsAgreed?: boolean;
    preauthAgreed?: boolean;
  };
  const eventId = body.eventId?.trim();
  if (!eventId) {
    return NextResponse.json({ error: "eventId is required" }, { status: 400 });
  }
  if (!body.termsAgreed || !body.preauthAgreed) {
    return NextResponse.json(
      { error: "Agree to this auction's terms and the Sunday $50 pre-authorization." },
      { status: 400 },
    );
  }
  const event = await loadEvent(eventId);
  if (!event) {
    return NextResponse.json({ error: "Auction not found" }, { status: 404 });
  }
  await saveAuctionRegistration(session.id, eventId);
  const auth = await evaluateBidAuth(session.id, eventId);
  return NextResponse.json({ ...auth, terms: auctionTermsPack(event) });
}
