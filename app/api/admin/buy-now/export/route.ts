import { NextResponse } from "next/server";
import { isAdminSession, unauthorized } from "@/lib/adminAuth";
import { getAdminDemo } from "@/lib/demoAdminStore";
import { mapLot, type LotRow } from "@/lib/mappers";
import { isBuyNowChannel } from "@/lib/saleChannel";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabaseClient";
import { xlsxWorkbook } from "@/lib/xlsxWorkbook";
import type { AuctionLot } from "@/lib/utils";

export const dynamic = "force-dynamic";

function rowsFor(lots: AuctionLot[]) {
  return [
    [
      "Lot #",
      "Title",
      "Price",
      "Status",
      "Buy now status",
      "Consignor",
      "Category",
      "Grade",
      "Paid",
      "Description",
    ],
    ...lots.map((lot) => [
      lot.lotNumber ?? "",
      lot.title,
      lot.buyNowPrice ?? lot.reservePrice ?? lot.currentBid,
      lot.status ?? "",
      lot.buyNowStatus ?? "",
      lot.consignor,
      lot.category,
      lot.listingGrade ?? "",
      lot.paidAt ?? "",
      lot.description,
    ]),
  ];
}

export async function GET() {
  if (!isAdminSession()) return unauthorized();

  let lots: AuctionLot[] = [];
  const supabase = getSupabaseAdmin();
  if (isSupabaseConfigured && supabase) {
    const { data } = await supabase.from("lots").select("*").eq("sale_channel", "buy_now").order("created_at", { ascending: false });
    lots = ((data ?? []) as LotRow[]).map(mapLot);
  } else {
    lots = getAdminDemo().inventory.filter(isBuyNowChannel);
  }

  const body = xlsxWorkbook([{ name: "Buy Now", rows: rowsFor(lots) }]);
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="DealFinder-buy-now.xlsx"`,
    },
  });
}
