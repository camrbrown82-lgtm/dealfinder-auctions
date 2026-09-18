import { NextRequest, NextResponse } from "next/server";
import { isAdminSession, unauthorized } from "@/lib/adminAuth";
import { filterAuctionDesk, loadAuctionDesk } from "@/lib/auctionDesk";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isAdminSession()) return unauthorized();
  const eventId = request.nextUrl.searchParams.get("eventId");
  const q = request.nextUrl.searchParams.get("q") ?? "";
  const desk = filterAuctionDesk(await loadAuctionDesk(eventId), q);
  return NextResponse.json(desk);
}
