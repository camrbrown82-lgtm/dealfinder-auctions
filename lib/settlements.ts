import type { CustomerRow } from "@/lib/adminTypes";
import { settlementInvoice } from "@/lib/payments";
import type { AuctionEvent, AuctionLot } from "@/lib/utils";

export type SettlementLot = {
  id: string;
  title: string;
  lotNumber?: string | null;
  hammer: number;
};

export type BuyerSettlement = {
  invoice: string;
  buyerKey: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  paymentMethod: string;
  lots: SettlementLot[];
  total: number;
};

export type AuctionSettlement = {
  eventId: string;
  name: string;
  auctionNumber: string;
  startsAt: string;
  endsAt: string;
  invoices: BuyerSettlement[];
  unsold: AuctionLot[];
};

export function lotWasSold(lot: AuctionLot) {
  return lot.status === "ended" && Boolean(lot.highBidderId || lot.highBidder);
}

export function lotNeedsRelist(lot: AuctionLot) {
  if (lot.status === "removed" || lot.status === "draft") return false;
  if (!lot.eventId) return true;
  return lot.status === "ended" && !lot.highBidderId && !lot.highBidder;
}

export function buildAuctionSettlements(
  events: AuctionEvent[],
  lots: AuctionLot[],
  customers: CustomerRow[],
): AuctionSettlement[] {
  const byId = new Map(customers.map((row) => [row.id, row]));
  const byName = new Map(customers.map((row) => [row.fullName.toLowerCase(), row]));

  return [...events]
    .sort((a, b) => new Date(b.endsAt).getTime() - new Date(a.endsAt).getTime())
    .map((event) => {
      const inSale = lots.filter((lot) => lot.eventId === event.id && lot.status !== "removed");
      const sold = inSale.filter(lotWasSold);
      const groups = new Map<string, AuctionLot[]>();
      for (const lot of sold) {
        const key = lot.highBidderId || lot.highBidder || "floor";
        const list = groups.get(key) ?? [];
        list.push(lot);
        groups.set(key, list);
      }
      const invoices: BuyerSettlement[] = Array.from(groups.entries()).map(([key, group]) => {
        const profile = byId.get(key) || byName.get((group[0].highBidder ?? "").toLowerCase());
        const name = profile?.fullName || group[0].highBidder || "Floor bidder";
        const address = profile
          ? [profile.street, profile.city, profile.province, profile.postalCode].filter(Boolean).join(", ")
          : "No shipping profile on file";
        const total = group.reduce((sum, lot) => sum + lot.currentBid, 0);
        return {
          invoice: settlementInvoice(event.auctionNumber, key),
          buyerKey: key,
          name,
          email: profile?.email ?? "",
          phone: profile?.phone ?? "",
          address,
          paymentMethod: profile?.paymentMethod ?? "",
          lots: group.map((lot) => ({
            id: lot.id,
            title: lot.title,
            lotNumber: lot.lotNumber,
            hammer: lot.currentBid,
          })),
          total,
        };
      });
      invoices.sort((a, b) => a.name.localeCompare(b.name));
      return {
        eventId: event.id,
        name: event.name,
        auctionNumber: event.auctionNumber ?? event.name,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        invoices,
        unsold: inSale.filter(lotNeedsRelist),
      };
    })
    .filter((row) => row.invoices.length > 0 || row.unsold.length > 0);
}
