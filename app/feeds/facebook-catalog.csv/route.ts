import { NextResponse } from "next/server";
import { facebookCatalogCsv } from "@/lib/facebookCatalog";
import { mapLot, type LotRow } from "@/lib/mappers";
import { isListedBuyNow } from "@/lib/saleChannel";
import { getAdminDemo } from "@/lib/demoAdminStore";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabaseClient";
import { MOCK_LOTS, type AuctionLot } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function GET() {
  const csv = facebookCatalogCsv(await buyNowCatalogLots());
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "inline; filename=\"facebook-catalog.csv\"",
      "Cache-Control": "public, max-age=300",
    },
  });
}

async function buyNowCatalogLots(): Promise<AuctionLot[]> {
  const supabase = getSupabaseAdmin();
  if (!isSupabaseConfigured || !supabase) {
    const demo = getAdminDemo();
    const byId = new Map<string, AuctionLot>();
    for (const lot of [...MOCK_LOTS, ...demo.inventory]) byId.set(lot.id, lot);
    return Array.from(byId.values()).filter(isListedBuyNow);
  }

  const { data, error } = await supabase
    .from("lots")
    .select("*")
    .not("status", "in", "(removed,draft)")
    .order("created_at", { ascending: false });

  if (error || !data) {
    console.error("facebookCatalog", error?.message);
    return [];
  }

  return (data as LotRow[]).map(mapLot);
}
