import { invoiceFees } from "@/lib/invoiceFees";
import type { AuctionSettlement, BuyerSettlement, SettlementLot } from "@/lib/settlements";

export type PaymentMark = "unpaid" | "partial" | "paid" | "cash_pending";
export type ShippingMark = "pending" | "ready" | "shipped" | "picked_up";

export type InvoiceMark = {
  payment: PaymentMark;
  shipping: ShippingMark;
  notes: string;
  fulfillment?: "unset" | "ship" | "pickup";
  shippingCost?: number;
};

export type SettlementInvoiceRecord = InvoiceMark & {
  invoice: string;
  eventId: string | null;
  buyerKey: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  paymentMethod: string;
  lots: SettlementLot[];
  total: number;
  hammer?: number;
  premium?: number;
  handling?: number;
  gst?: number;
  shippingCost?: number;
  fulfillment?: "unset" | "ship" | "pickup";
  paymentChannel?: "helcim" | "cash";
  winEmailSentAt?: string | null;
};

export type SettlementArchiveRecord = {
  eventId: string;
  auctionNumber: string;
  name: string;
  savedAt: string;
  snapshot: AuctionSettlement;
};

export function emptyMark(): InvoiceMark {
  return { payment: "unpaid", shipping: "pending", notes: "", fulfillment: "unset", shippingCost: 0 };
}

export function marksFromInvoices(rows: SettlementInvoiceRecord[]): Record<string, InvoiceMark> {
  const marks: Record<string, InvoiceMark> = {};
  for (const row of rows) {
    marks[row.invoice] = {
      payment: row.payment,
      shipping: row.shipping,
      notes: row.notes,
      fulfillment: row.fulfillment ?? "unset",
      shippingCost: row.shippingCost ?? 0,
    };
  }
  return marks;
}

export function invoiceRecordFromBuyer(
  eventId: string,
  buyer: BuyerSettlement,
  mark: InvoiceMark,
): SettlementInvoiceRecord {
  const fulfillment = mark.fulfillment ?? buyer.fulfillment ?? "unset";
  const fees = invoiceFees({
    hammer: buyer.lots.reduce((sum, lot) => sum + lot.hammer, 0),
    fulfillment,
    shippingCost: mark.shippingCost ?? buyer.shippingCost ?? 0,
  });
  return {
    invoice: buyer.invoice,
    eventId,
    buyerKey: buyer.buyerKey,
    name: buyer.name,
    email: buyer.email,
    phone: buyer.phone,
    address: buyer.address,
    paymentMethod: buyer.paymentMethod,
    lots: buyer.lots,
    ...mark,
    fulfillment,
    total: fees.total,
    hammer: fees.hammer,
    premium: fees.premium,
    handling: fees.handling,
    gst: fees.gst,
    shippingCost: fees.shipping,
  };
}
