import { NextRequest, NextResponse } from "next/server";
import { bidderUnauthorized, getBidderSession } from "@/lib/bidderAuth";
import { claimBuyNowLot } from "@/lib/buyNowPurchase";
import { isProfileComplete } from "@/lib/profileTypes";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const session = await getBidderSession();
  if (!session) return bidderUnauthorized();
  if (session.status === "suspended") {
    return NextResponse.json({ error: "This account cannot purchase right now." }, { status: 403 });
  }
  if (!isProfileComplete(session)) {
    return NextResponse.json(
      { error: "Finish your bidder profile before buying." },
      { status: 400 },
    );
  }

  const body = (await request.json()) as { lotId?: string };
  const lotId = body.lotId?.trim();
  if (!lotId) {
    return NextResponse.json({ error: "lotId is required." }, { status: 400 });
  }

  try {
    const lot = await claimBuyNowLot(lotId, session);
    return NextResponse.json({
      ok: true,
      lotId: lot.id,
      slug: lot.slug,
      checkout: `/checkout?lot=${encodeURIComponent(lot.id)}`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not start Buy Now checkout." },
      { status: 400 },
    );
  }
}
