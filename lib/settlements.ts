import type { CustomerRow } from "@/lib/adminTypes";
import { invoiceFees, money } from "@/lib/invoiceFees";
import { settlementInvoice, type FulfillmentChoice } from "@/lib/payments";
import type { SettlementInvoiceRecord } from "@/lib/settlementRecords";
import type { AuctionEvent, AuctionLot } from "@/lib/utils";

export type SettlementLot = {
  id: string;
  title: string;
  lotNumber?: string | null;
  hammer: number;
  image?: string | null;
  fulfillment?: FulfillmentChoice;
};

export function settlementLotFrom(
  lot: Pick<AuctionLot, "id" | "title" | "lotNumber" | "currentBid" | "image" | "images" | "fulfillment"> & {
    hammer?: number;
  },
): SettlementLot {
  return {
    id: lot.id,
    title: lot.title,
    lotNumber: lot.lotNumber ?? null,
    hammer: Number(lot.hammer ?? lot.currentBid ?? 0),
    image: lot.image || lot.images?.[0] || null,
    fulfillment: lot.fulfillment === "ship" || lot.fulfillment === "pickup" ? lot.fulfillment : "unset",
  };
}

/**
 * An invoice carries one delivery choice, so it only takes a side when every
 * lot on it agrees. A single shipped lot used to drag the whole consolidated
 * invoice into shipping and bill the buyer handling and postage on lots they
 * meant to collect.
 */
export function invoiceFulfillment(
  lots: Array<{ fulfillment?: string | null }>,
): FulfillmentChoice {
  if (lots.length === 0) return "unset";
  if (lots.every((lot) => lot.fulfillment === "ship")) return "ship";
  if (lots.every((lot) => lot.fulfillment === "pickup")) return "pickup";
  return "unset";
}

export type BuyerSettlement = {
  invoice: string;
  buyerKey: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  paymentMethod: string;
  lots: SettlementLot[];
  hammer: number;
  premium: number;
  handling: number;
  shippingCost: number;
  gst: number;
  total: number;
  fulfillment?: FulfillmentChoice;
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

export function lotClockEnded(lot: Pick<AuctionLot, "endsAt">, now = Date.now()) {
  const end = Date.parse(String(lot.endsAt ?? ""));
  return Number.isFinite(end) && end <= now;
}

export function lotNeedsRelist(lot: AuctionLot, now = Date.now()) {
  if (lot.status === "draft") return false;
  if (lotWasSold(lot)) return false;
  if (lot.status === "removed" || lot.status === "ended") return true;
  if (!lot.eventId) return true;
  return lotClockEnded(lot, now);
}

export function lotIsUnsoldOrNoBid(lot: AuctionLot, now = Date.now()) {
  if (lot.status === "draft") return false;
  if (lotWasSold(lot)) return false;
  return lotNeedsRelist(lot, now);
}

function groupFulfillment(lots: AuctionLot[]): FulfillmentChoice {
  return invoiceFulfillment(lots);
}

export function withBuyerFees(
  buyer: Omit<BuyerSettlement, "hammer" | "premium" | "handling" | "gst" | "total"> &
    Partial<Pick<BuyerSettlement, "hammer" | "premium" | "handling" | "gst" | "total" | "shippingCost" | "fulfillment">>,
): BuyerSettlement {
  const hammer = money(buyer.lots.reduce((sum, lot) => sum + lot.hammer, 0));
  const fulfillment = buyer.fulfillment ?? "unset";
  const fees = invoiceFees({
    hammer,
    fulfillment,
    shippingCost: buyer.shippingCost ?? 0,
  });
  return {
    ...buyer,
    fulfillment,
    shippingCost: fees.shipping,
    hammer: fees.hammer,
    premium: fees.premium,
    handling: fees.handling,
    gst: fees.gst,
    total: fees.total,
  };
}

export function itemizeAuctionSettlements(sales: AuctionSettlement[]): AuctionSettlement[] {
  return sales.map((sale) => ({
    ...sale,
    invoices: sale.invoices.flatMap((invoice) =>
      invoice.lots.map((lot, index) =>
        withBuyerFees({
          ...invoice,
          lots: [lot],
          fulfillment: index === 0 ? invoice.fulfillment : "pickup",
          shippingCost: index === 0 ? invoice.shippingCost : 0,
        }),
      ),
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
      const fulfillment = groupFulfillment(group);
      const shippingCost = group.reduce((sum, lot) => sum + (lot.shippingCost ?? 0), 0);
      return withBuyerFees({
        invoice: settlementInvoice(auctionNumber, key),
        buyerKey: key,
        name,
        email: profile?.email ?? "",
        phone: profile?.phone ?? "",
        address,
        paymentMethod: profile?.paymentMethod ?? "",
        lots: group.map((lot) => settlementLotFrom(lot)),
        fulfillment,
        shippingCost,
      });
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
    const buyer = withBuyerFees({
      invoice: invoice.invoice,
      buyerKey: invoice.buyerKey,
      name: invoice.name,
      email: invoice.email,
      phone: invoice.phone,
      address: invoice.address,
      paymentMethod: invoice.paymentMethod,
      lots: invoice.lots,
      total: invoice.total,
      fulfillment: invoice.fulfillment ?? "unset",
      shippingCost: invoice.shippingCost ?? 0,
    });
    const index = sale.invoices.findIndex((item) => item.invoice === invoice.invoice);
    if (index >= 0) {
      const lots = [...sale.invoices[index].lots];
      for (const lot of invoice.lots) {
        if (!lots.some((item) => item.id === lot.id)) lots.push(lot);
        else {
          const current = lots.find((item) => item.id === lot.id);
          if (current && !current.image && lot.image) current.image = lot.image;
        }
      }
      const current = sale.invoices[index];
      sale.invoices[index] = withBuyerFees({
        ...current,
        email: current.email || invoice.email,
        phone: current.phone || invoice.phone,
        address: current.address && current.address !== "No shipping profile on file" ? current.address : invoice.address || current.address,
        lots,
        fulfillment: invoice.fulfillment ?? current.fulfillment,
        shippingCost: invoice.shippingCost ?? current.shippingCost,
      });
    } else {
      sale.invoices.push(buyer);
    }
  }
  return next.filter((row) => row.invoices.length > 0 || row.unsold.length > 0);
}

export const BUY_NOW_SETTLEMENT_ID = "buy-now";

function isSettledBuyNow(lot: AuctionLot) {
  return lot.saleSource === "buy_now" || lot.buyNowStatus === "sold";
}

/** Auction sales by end date, plus Buy Now as its own settlement. */
export function settlementDeskSales(
  events: AuctionEvent[],
  lots: AuctionLot[],
  customers: CustomerRow[],
  invoices: SettlementInvoiceRecord[],
): AuctionSettlement[] {
  const buyNowLots = lots.filter(isSettledBuyNow);
  const buyNowLotIds = new Set(buyNowLots.map((lot) => lot.id));
  const buyNowInvoices = invoices.filter(
    (row) => !row.eventId || row.lots.some((lot) => buyNowLotIds.has(lot.id)),
  );
  const buyNowInvoiceIds = new Set(buyNowInvoices.map((row) => row.invoice));
  const auctionInvoices = invoices.filter((row) => !buyNowInvoiceIds.has(row.invoice));
  const auctionSales = mergePersistedInvoices(
    buildAuctionSettlements(
      events,
      lots.filter((lot) => !isSettledBuyNow(lot)),
      customers,
    ),
    auctionInvoices,
  );

  const latest = buyNowLots.reduce((max, lot) => (lot.endsAt > max ? lot.endsAt : max), "");
  const buyNowEvent: AuctionEvent = {
    id: BUY_NOW_SETTLEMENT_ID,
    name: "Buy Now",
    auctionNumber: "BUY NOW",
    startsAt: latest || new Date(0).toISOString(),
    endsAt: latest || new Date().toISOString(),
  };
  const buyNowBuilt = mergePersistedInvoices(
    buildAuctionSettlements(
      [buyNowEvent],
      buyNowLots.map((lot) => ({ ...lot, eventId: BUY_NOW_SETTLEMENT_ID })),
      customers,
    ),
    buyNowInvoices.map((row) => ({ ...row, eventId: BUY_NOW_SETTLEMENT_ID })),
  );
  const buyNow = buyNowBuilt.find((sale) => sale.eventId === BUY_NOW_SETTLEMENT_ID);

  const byId = new Map(auctionSales.map((sale) => [sale.eventId, sale]));
  const fromEvents = [...events]
    .sort((a, b) => new Date(b.endsAt).getTime() - new Date(a.endsAt).getTime())
    .map(
      (event) =>
        byId.get(event.id) ?? {
          eventId: event.id,
          name: event.name,
          auctionNumber: event.auctionNumber ?? event.name,
          startsAt: event.startsAt,
          endsAt: event.endsAt,
          invoices: [],
          unsold: [],
        },
    );
  const unfiled = auctionSales.find((sale) => sale.eventId === "house-floor" && sale.invoices.length > 0);
  const byCustomer = new Map(customers.map((row) => [row.id, row]));
  const byCustomerName = new Map(customers.map((row) => [row.fullName.toLowerCase(), row]));

  return [
    ...(buyNow && buyNow.invoices.length > 0 ? [buyNow] : []),
    ...fromEvents,
    ...(unfiled ? [unfiled] : []),
  ].map((sale) => ({
    ...sale,
    invoices: sale.invoices.map((invoice) => {
      if (invoice.email || invoice.phone) return invoice;
      const profile = byCustomer.get(invoice.buyerKey) || byCustomerName.get(invoice.name.toLowerCase());
      if (!profile) return invoice;
      return { ...invoice, email: profile.email, phone: profile.phone };
    }),
  }));
}
