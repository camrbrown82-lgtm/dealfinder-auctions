export type SaleChannel = "auction" | "buy_now";
export type BuyNowStatus = "pending_approval" | "listed" | "sold";

export function asSaleChannel(value: unknown): SaleChannel {
  return value === "buy_now" ? "buy_now" : "auction";
}

export function asBuyNowStatus(value: unknown): BuyNowStatus | null {
  if (value === "pending_approval" || value === "listed" || value === "sold") return value;
  return null;
}

export function isBuyNowChannel(lot: {
  saleChannel?: string | null;
  sale_channel?: string | null;
}) {
  return asSaleChannel(lot.saleChannel ?? lot.sale_channel) === "buy_now";
}

export function isListedBuyNow(lot: {
  saleChannel?: string | null;
  sale_channel?: string | null;
  buyNowStatus?: string | null;
  buy_now_status?: string | null;
  status?: string | null;
  paidAt?: string | null;
  paid_at?: string | null;
}) {
  if (!isBuyNowChannel(lot)) return false;
  const status = asBuyNowStatus(lot.buyNowStatus ?? lot.buy_now_status);
  if (status !== "listed") return false;
  if (lot.status === "ended" || lot.status === "removed") return false;
  if (lot.paidAt || lot.paid_at) return false;
  return true;
}

export function invoiceReadyForSale(lot: {
  saleChannel?: string | null;
  sale_channel?: string | null;
  saleSource?: string | null;
  sale_source?: string | null;
}) {
  return isBuyNowChannel(lot) || lot.saleSource === "buy_now" || lot.sale_source === "buy_now";
}
