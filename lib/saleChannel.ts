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

export function hasBuyNowPrice(lot: {
  buyNowPrice?: number | null;
  buy_now_price?: number | string | null;
  reservePrice?: number | null;
  reserve_price?: number | string | null;
}) {
  const raw = lot.buyNowPrice ?? lot.buy_now_price ?? lot.reservePrice ?? lot.reserve_price ?? 0;
  const price = Number(raw);
  return Number.isFinite(price) && price > 0;
}

/** Any unsold item carrying a Buy Now price lists on Buy Now, whichever auction
 *  it sits in and whenever that auction runs. It stays in the sale as well. */
export function isListedBuyNow(lot: {
  saleChannel?: string | null;
  sale_channel?: string | null;
  buyNowStatus?: string | null;
  buy_now_status?: string | null;
  buyNowPrice?: number | null;
  buy_now_price?: number | string | null;
  reservePrice?: number | null;
  reserve_price?: number | string | null;
  status?: string | null;
  paidAt?: string | null;
  paid_at?: string | null;
  highBidder?: string | null;
  high_bidder?: string | null;
  highBidderId?: string | null;
  high_bidder_id?: string | null;
}) {
  const status = asBuyNowStatus(lot.buyNowStatus ?? lot.buy_now_status);
  if (status === "sold" || status === "pending_approval") return false;
  if (lot.status === "removed" || lot.status === "draft") return false;
  if (lot.paidAt || lot.paid_at) return false;
  // An ended lot that found a winner belongs to that paddle, not to the store.
  const won = Boolean(
    lot.highBidder ?? lot.high_bidder ?? lot.highBidderId ?? lot.high_bidder_id,
  );
  if (lot.status === "ended" && won) return false;
  return status === "listed" || isBuyNowChannel(lot) || hasBuyNowPrice(lot);
}

export function invoiceReadyForSale(lot: {
  saleChannel?: string | null;
  sale_channel?: string | null;
  saleSource?: string | null;
  sale_source?: string | null;
  buyNowStatus?: string | null;
  buy_now_status?: string | null;
}) {
  if (asBuyNowStatus(lot.buyNowStatus ?? lot.buy_now_status) === "sold") return true;
  return isBuyNowChannel(lot) || lot.saleSource === "buy_now" || lot.sale_source === "buy_now";
}

/** Buy Now is a separate sale: pay now, leave the live floor. Auction wins wait for Sunday. */
export function isImmediateBuyNow(lot: {
  saleSource?: string | null;
  sale_source?: string | null;
  buyNowStatus?: string | null;
  buy_now_status?: string | null;
}) {
  return invoiceReadyForSale(lot);
}
