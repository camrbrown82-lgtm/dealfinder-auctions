export function buyNowPriceOf(row: {
  buyNowPrice?: number | null;
  reservePrice?: number | null;
}) {
  const value = row.buyNowPrice ?? row.reservePrice ?? 0;
  return value > 0 ? value : null;
}

export function startingBidFromBuyNow(buyNow: number) {
  return Math.max(5, Math.round(buyNow * 0.45));
}

export function canBuyNow(currentBid: number, buyNow: number | null | undefined) {
  return Boolean(buyNow && buyNow > currentBid);
}

export function buyNowColumns(price: number | null | undefined) {
  const value = price && price > 0 ? price : null;
  return {
    reserve_price: value,
    buy_now_price: value,
  };
}
