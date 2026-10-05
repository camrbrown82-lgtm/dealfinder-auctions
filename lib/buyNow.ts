export function buyNowPriceOf(row: {
  buyNowPrice?: number | null;
  reservePrice?: number | null;
}) {
  const value = row.buyNowPrice ?? row.reservePrice ?? 0;
  return value > 0 ? value : null;
}

/**
 * Opening price for one lot.
 * A typed start is kept as-is, including under $5.
 * A blank start stays at the house default ($5), unless Buy Now is set lower than that.
 */
export function openingBid(startingBid: unknown, buyNow?: unknown, fallback = 5) {
  const start = Number(startingBid);
  if (Number.isFinite(start) && start > 0) return Math.round(start * 100) / 100;
  const end = Number(buyNow);
  const house = Number(fallback);
  const houseDefault = Number.isFinite(house) && house > 0 ? house : 5;
  if (Number.isFinite(end) && end > 0) {
    if (end <= houseDefault) return Math.round(end * 100) / 100;
    const derived = Math.round(end * 0.45);
    return derived > 0 ? derived : Math.round(end * 100) / 100;
  }
  return houseDefault;
}

export function startingBidFromBuyNow(buyNow: number) {
  return openingBid(null, buyNow, 5);
}

export function canBuyNow(currentBid: number, buyNow: number | null | undefined) {
  return Boolean(buyNow && buyNow >= currentBid);
}

export function buyNowColumns(price: number | null | undefined) {
  const value = price && price > 0 ? price : null;
  return {
    reserve_price: value,
    buy_now_price: value,
  };
}
