export const STANDARD_BUY_NOW_LIMIT = 50;

export const BUY_NOW_LIMIT_MESSAGE =
  "You have reached your standard Buy-Now reservation limit for this auction. Please await auction settlement or contact management to upgrade to Trusted Status.";

export function buyNowCap(input: { isTrustedBuyer?: boolean | null; buyNowLimit?: number | null }) {
  if (input.isTrustedBuyer) {
    const custom = Number(input.buyNowLimit);
    if (Number.isFinite(custom) && custom > 0) return custom;
    return Number.POSITIVE_INFINITY;
  }
  return STANDARD_BUY_NOW_LIMIT;
}
