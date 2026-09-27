export function moneySplit(amount: number, commissionRate: number) {
  const house = Math.round(amount * commissionRate);
  const consignor = Math.max(0, Math.round(amount - house));
  return { house, consignor };
}

/** Section 3 of the consignment agreement. Every sale price above $0 falls in one tier. */
export function agreementCommission(soldFor: number): {
  house: number;
  consignor: number;
  label: string;
  rate: number | null;
} | null {
  const amount = Math.round(soldFor * 100) / 100;
  if (!(amount > 0)) return null;
  if (amount <= 20) {
    const split = moneySplit(amount, 0.5);
    return { ...split, label: "50%", rate: 0.5 };
  }
  if (amount < 50) {
    const house = 10;
    return { house, consignor: Math.max(0, Math.round(amount - house)), label: "$10", rate: null };
  }
  if (amount < 500) {
    const split = moneySplit(amount, 0.2);
    return { ...split, label: "20%", rate: 0.2 };
  }
  const split = moneySplit(amount, 0.15);
  return { ...split, label: "15%", rate: 0.15 };
}
