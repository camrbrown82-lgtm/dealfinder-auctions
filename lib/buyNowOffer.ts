import { formatCurrency } from "@/lib/utils";

/** New Buy Now consignments from this point on. Older lots are left as they are. */
export const BUY_NOW_MINIMUM = 100;

export function buyNowOfferError(amount: number) {
  if (!(amount > 0)) return "";
  if (amount < BUY_NOW_MINIMUM) {
    return `Buy Now is ${formatCurrency(BUY_NOW_MINIMUM)} minimum. Leave the price blank to consign for the live auction.`;
  }
  return "";
}

export function buyNowDisclaimer(offer: number) {
  return `Buy Now is ${formatCurrency(BUY_NOW_MINIMUM)} minimum. You are asking to receive ${formatCurrency(offer)}. That is what you are paid when it sells. There is no house commission on Buy Now. DealFinder sets the price buyers pay and keeps the difference. Leave the price blank for the live auction, where the agreement commission applies.`;
}

export function buyNowApprovalNote(offer: number, payout: number, listPrice: number) {
  const countered = Math.round(payout * 100) !== Math.round(offer * 100);
  const pay = countered
    ? `You asked to receive ${formatCurrency(offer)}. You accepted DealFinder's counter of ${formatCurrency(payout)}, and that is what you are paid when it sells.`
    : `You asked to receive ${formatCurrency(offer)}, and that is what you are paid when it sells.`;
  return `${pay} Buyers see it at ${formatCurrency(listPrice)}. There is no house commission on Buy Now. DealFinder keeps the difference between the buyer price and your payout.`;
}

export function counterOfferError(amount: number) {
  if (!(amount > 0)) return "";
  if (amount < BUY_NOW_MINIMUM) {
    return `A Buy Now counter is ${formatCurrency(BUY_NOW_MINIMUM)} minimum. Leave it blank to reject with no offer.`;
  }
  return "";
}

/** What the consignor is paid. An accepted counter replaces their original ask. */
export function consignorPayAmount(item: {
  consignorOffer?: number | null;
  agreedPayout?: number | null;
  counterOffer?: number | null;
  counterStatus?: string | null;
  buyNowPrice?: number | null;
  reservePrice?: number | null;
}) {
  if (item.counterStatus === "accepted") {
    return Number(item.agreedPayout ?? item.counterOffer ?? 0) || 0;
  }
  return Number(item.consignorOffer ?? item.buyNowPrice ?? item.reservePrice ?? 0) || 0;
}
