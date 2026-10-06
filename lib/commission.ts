import { DEFAULT_COMMISSION_RATE, formatCurrency } from "@/lib/utils";

export function moneySplit(amount: number, commissionRate: number) {
  const house = Math.round(amount * commissionRate);
  const consignor = Math.max(0, Math.round(amount - house));
  return { house, consignor };
}

export function houseCommissionPercent(rate = DEFAULT_COMMISSION_RATE) {
  return Math.round(rate * 100);
}

export function consignmentCommissionNote(_rate = DEFAULT_COMMISSION_RATE) {
  return "House commission follows the consignor agreement. Lots sold at $50 or below are 50%, to a maximum commission of $10. After $50, the commission is 20%.";
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

/** Section 3 of the consignment agreement. $50 or below is 50% up to $10. After $50 is 20%. */
export function agreementCommission(soldFor: number): {
  house: number;
  consignor: number;
  label: string;
  rate: number | null;
} | null {
  const amount = Math.round(soldFor * 100) / 100;
  if (!(amount > 0)) return null;
  if (amount <= 50) {
    const half = Math.round(amount * 0.5);
    const house = Math.min(10, half);
    return {
      house,
      consignor: Math.max(0, Math.round(amount - house)),
      label: house < half ? "$10 max" : "50%",
      rate: house < half ? null : 0.5,
    };
  }
  const split = moneySplit(amount, 0.2);
  return { ...split, label: "20%", rate: 0.2 };
}

/** Buy Now consignments pay the agreed offer. The house keeps list price minus that offer. */
export function fixedOfferSplit(hammer: number, payout: number) {
  const owed = Math.round(payout * 100) / 100;
  const sold = Math.round(hammer * 100) / 100;
  const house = Math.max(0, Math.round((sold - owed) * 100) / 100);
  return { house, consignor: owed, label: "Buy Now offer", rate: 0 };
}

export function settlementSplit(hammer: number, fixedPayout?: number | null) {
  const fixed = Number(fixedPayout ?? 0);
  if (fixed > 0) return fixedOfferSplit(hammer, fixed);
  return agreementCommission(hammer);
}
