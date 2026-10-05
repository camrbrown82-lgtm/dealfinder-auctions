import { notifyConsignorSold } from "@/lib/consignorSold";
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
  options?: { notify?: boolean },
) {
  const saleSource = lot.saleSource === "buy_now" ? "buy_now" : source;
  await queueWonLot(lot, buyer, saleSource, {
    notify: options?.notify ?? true,
  });
  // The seller hears about it too, not just the buyer.
  await notifyConsignorSold(lot).catch((error) => {
    console.error("notifyConsignorSold", error instanceof Error ? error.message : error);
  });
}
