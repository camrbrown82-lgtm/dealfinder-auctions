import { NextResponse } from "next/server";
import { fetchLiveCatalog } from "@/lib/lots";
import { isAuctionEndDay } from "@/lib/auctionEndDay";
import { runSundayPreauthSweep } from "@/lib/sundayPreauth";
import { closeEndedSoldLots } from "@/lib/closeEndedLots";

export const dynamic = "force-dynamic";

declare global {
  // eslint-disable-next-line no-var
  var __dealfinderSundaySweepAt: number | undefined;
}

export async function GET() {
  void closeEndedSoldLots().catch(() => undefined);
  if (isAuctionEndDay()) {
    const now = Date.now();
    if (!globalThis.__dealfinderSundaySweepAt || now - globalThis.__dealfinderSundaySweepAt > 10 * 60 * 1000) {
      globalThis.__dealfinderSundaySweepAt = now;
      void runSundayPreauthSweep("127.0.0.1").catch(() => undefined);
    }
  }
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
