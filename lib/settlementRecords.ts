import type { AuctionSettlement, BuyerSettlement, SettlementLot } from "@/lib/settlements";

export type PaymentMark = "unpaid" | "partial" | "paid";
export type ShippingMark = "pending" | "ready" | "shipped" | "picked_up";

export type InvoiceMark = {
  payment: PaymentMark;
  shipping: ShippingMark;
  notes: string;
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
};

export type SettlementArchiveRecord = {
  eventId: string;
  auctionNumber: string;
  name: string;
  savedAt: string;
  snapshot: AuctionSettlement;
};

export function emptyMark(): InvoiceMark {
  return { payment: "unpaid", shipping: "pending", notes: "" };
}

export function marksFromInvoices(rows: SettlementInvoiceRecord[]): Record<string, InvoiceMark> {
  const marks: Record<string, InvoiceMark> = {};
  for (const row of rows) {
    marks[row.invoice] = {
      payment: row.payment,
      shipping: row.shipping,
      notes: row.notes,
    };
  }
  return marks;
}

export function invoiceRecordFromBuyer(
  eventId: string,
  buyer: BuyerSettlement,
  mark: InvoiceMark,
): SettlementInvoiceRecord {
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
    total: buyer.total,
    ...mark,
  };
}
