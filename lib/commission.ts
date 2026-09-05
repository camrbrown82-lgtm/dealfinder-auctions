export function moneySplit(amount: number, commissionRate: number) {
  const house = Math.round(amount * commissionRate);
  const consignor = Math.max(0, Math.round(amount - house));
  return { house, consignor };
}
