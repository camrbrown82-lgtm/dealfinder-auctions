import type { CustomerRow } from "@/lib/adminTypes";
import { settlementInvoice } from "@/lib/payments";
import type { SettlementInvoiceRecord } from "@/lib/settlementRecords";
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
  if (lot.status === "draft") return false;
  return Boolean(lot.highBidderId || lot.highBidder) && (lot.status === "ended" || lot.status === "removed");
}

export function lotNeedsRelist(lot: AuctionLot) {
  if (lot.status === "draft") return false;
  if (lotWasSold(lot)) return false;
  if (lot.status === "removed") return true;
  if (!lot.eventId) return lot.status === "ended";
  return lot.status === "ended";
}

export function lotIsUnsoldOrNoBid(lot: AuctionLot) {
  if (lot.status === "draft") return false;
  if (lotWasSold(lot)) return false;
  if (lotNeedsRelist(lot)) return true;
  const noBidder = !lot.highBidder && !lot.highBidderId;
  return noBidder && (lot.status === "ended" || lot.status === "removed");
}

export function itemizeAuctionSettlements(sales: AuctionSettlement[]): AuctionSettlement[] {
  return sales.map((sale) => ({
    ...sale,
    invoices: sale.invoices.flatMap((invoice) =>
      invoice.lots.map((lot) => ({
        ...invoice,
        lots: [lot],
        total: lot.hammer,
      })),
    ),
  }));
}

function invoicesForSale(
  sold: AuctionLot[],
  auctionNumber: string | null | undefined,
  byId: Map<string, CustomerRow>,
  byName: Map<string, CustomerRow>,
): BuyerSettlement[] {
  const groups = new Map<string, AuctionLot[]>();
  for (const lot of sold) {
    const key = lot.highBidderId || lot.highBidder || "floor";
    const list = groups.get(key) ?? [];
    list.push(lot);
    groups.set(key, list);
  }
  return Array.from(groups.entries())
    .map(([key, group]) => {
      const profile = byId.get(key) || byName.get((group[0].highBidder ?? "").toLowerCase());
      const name = profile?.fullName || group[0].highBidder || "Floor bidder";
      const address = profile
        ? [profile.street, profile.city, profile.province, profile.postalCode].filter(Boolean).join(", ")
        : "No shipping profile on file";
      const total = group.reduce((sum, lot) => sum + lot.currentBid, 0);
      return {
        invoice: settlementInvoice(auctionNumber, key),
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
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function buildAuctionSettlements(
  events: AuctionEvent[],
  lots: AuctionLot[],
  customers: CustomerRow[],
): AuctionSettlement[] {
  const byId = new Map(customers.map((row) => [row.id, row]));
  const byName = new Map(customers.map((row) => [row.fullName.toLowerCase(), row]));
  const knownIds = new Set(events.map((event) => event.id));

  const fromEvents = [...events]
    .sort((a, b) => new Date(b.endsAt).getTime() - new Date(a.endsAt).getTime())
    .map((event) => {
      const inSale = lots.filter((lot) => lot.eventId === event.id && lot.status !== "draft");
      return {
        eventId: event.id,
        name: event.name,
        auctionNumber: event.auctionNumber ?? event.name,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        invoices: invoicesForSale(inSale.filter(lotWasSold), event.auctionNumber, byId, byName),
        unsold: inSale.filter(lotNeedsRelist),
      };
    });

  const orphans = lots.filter(
    (lot) =>
      lot.status !== "draft" &&
      (lotWasSold(lot) || lotNeedsRelist(lot)) &&
      (!lot.eventId || !knownIds.has(lot.eventId)),
  );
  if (orphans.length) {
    fromEvents.unshift({
      eventId: "house-floor",
      name: "House floor",
      auctionNumber: "HOUSE",
      startsAt: new Date(0).toISOString(),
      endsAt: new Date().toISOString(),
      invoices: invoicesForSale(orphans.filter(lotWasSold), "HOUSE", byId, byName),
      unsold: orphans.filter(lotNeedsRelist),
    });
  }

  return fromEvents.filter((row) => row.invoices.length > 0 || row.unsold.length > 0);
}

export function mergePersistedInvoices(
  sales: AuctionSettlement[],
  invoices: SettlementInvoiceRecord[],
): AuctionSettlement[] {
  const next = sales.map((sale) => ({ ...sale, invoices: [...sale.invoices] }));
  for (const invoice of invoices) {
    if (!invoice.lots?.length) continue;
    let sale =
      next.find((row) => invoice.eventId && row.eventId === invoice.eventId) ??
      next.find((row) => row.invoices.some((item) => item.invoice === invoice.invoice));
    if (!sale) {
      sale = {
        eventId: invoice.eventId || "house-floor",
        name: "Buy now / house floor",
        auctionNumber: "HOUSE",
        startsAt: new Date(0).toISOString(),
        endsAt: new Date().toISOString(),
        invoices: [],
        unsold: [],
      };
      next.unshift(sale);
    }
    const buyer = {
      invoice: invoice.invoice,
      buyerKey: invoice.buyerKey,
      name: invoice.name,
      email: invoice.email,
      phone: invoice.phone,
      address: invoice.address,
      paymentMethod: invoice.paymentMethod,
      lots: invoice.lots,
      total: invoice.total,
    };
    const index = sale.invoices.findIndex((item) => item.invoice === invoice.invoice);
    if (index >= 0) {
      const lots = [...sale.invoices[index].lots];
      for (const lot of invoice.lots) {
        if (!lots.some((item) => item.id === lot.id)) lots.push(lot);
      }
      sale.invoices[index] = {
        ...sale.invoices[index],
        lots,
        total: lots.reduce((sum, item) => sum + item.hammer, 0),
      };
    } else {
      sale.invoices.push(buyer);
    }
  }
  return next.filter((row) => row.invoices.length > 0 || row.unsold.length > 0);
}
