import { queueWonLot, type SaleSource } from "@/lib/pendingInvoices";
import type { AuctionLot } from "@/lib/utils";

export async function recordSoldLotSettlement(
  lot: AuctionLot,
  buyer: {
    id?: string | null;
    fullName?: string | null;
    email?: string | null;
    phone?: string | null;
    street?: string | null;
    city?: string | null;
    province?: string | null;
    postalCode?: string | null;
    paymentMethod?: string | null;
  },
  _auctionNumber?: string | null,
  source: SaleSource = "bid",
) {
  await queueWonLot(lot, buyer, lot.saleSource === "buy_now" ? "buy_now" : source);
}
