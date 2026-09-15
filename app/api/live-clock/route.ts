import { NextResponse } from "next/server";
import { fetchLiveCatalog } from "@/lib/lots";

export const dynamic = "force-dynamic";

export async function GET() {
  const catalog = await fetchLiveCatalog();
  return NextResponse.json(
    {
      lots: catalog.lots.map((lot) => ({
        id: lot.id,
        currentBid: lot.currentBid,
        endsAt: lot.endsAt,
        highBidder: lot.highBidder ?? null,
        status: lot.status ?? "live",
      })),
      floor: catalog.floor ?? null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
