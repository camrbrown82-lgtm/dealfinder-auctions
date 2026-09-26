import { DEFAULT_COMMISSION_RATE, formatCurrency } from "@/lib/utils";

export function moneySplit(amount: number, commissionRate: number) {
  const house = Math.round(amount * commissionRate);
  const consignor = Math.max(0, Math.round(amount - house));
  return { house, consignor };
}

export function houseCommissionPercent(rate = DEFAULT_COMMISSION_RATE) {
  return Math.round(rate * 100);
}

export function consignmentCommissionNote(rate = DEFAULT_COMMISSION_RATE) {
  const pct = houseCommissionPercent(rate);
  return `House commission follows the consignor agreement. DealFinder keeps ${pct}% of the hammer on most sales and you receive the rest. Final commission is based on the sale price (see the agreement for the other price tiers).`;
}

export type ConsignmentMailLine = {
  title: string;
  startingBid: number;
  buyNowPrice: number;
};

export function consignmentItemListText(items: ConsignmentMailLine[]) {
  return items
    .map((item, index) => {
      const prefix = items.length > 1 ? `${index + 1}. ` : "";
      return `${prefix}${item.title} — starting bid ${formatCurrency(item.startingBid)}, buy now ${formatCurrency(item.buyNowPrice)}`;
    })
    .join("\n");
}
