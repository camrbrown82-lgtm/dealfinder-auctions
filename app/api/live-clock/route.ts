import { NextResponse } from "next/server";
import { fetchLiveCatalog } from "@/lib/lots";
import { pickSaleWindow } from "@/lib/liveSales";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { isAuctionEndDay } from "@/lib/auctionEndDay";
import { runSundayPreauthSweep } from "@/lib/sundayPreauth";
import { issueEndedAuctionInvoices } from "@/lib/auctionCloseInvoices";
import { closeEndedSoldLots } from "@/lib/closeEndedLots";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

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
      void issueEndedAuctionInvoices().catch(() => undefined);
    }
  }
  const catalog = await fetchLiveCatalog();
  const sales = pickSaleWindow(catalog.events);
  const supabaseHost = (process.env.NEXT_PUBLIC_SUPABASE_URL || "")
    .replace(/^https?:\/\//, "")
    .split("/")[0];
  return NextResponse.json(
    {
      source: isSupabaseConfigured ? "supabase" : "demo",
      supabaseHost,
      lots: catalog.lots,
      sales,
      floor: catalog.floor ?? null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
