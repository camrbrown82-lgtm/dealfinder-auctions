/** House increment table from the current hammer. */
export function structuredIncrement(currentBid: number) {
  const amount = Number(currentBid);
  const value = Number.isFinite(amount) ? amount : 0;
  if (value <= 50) return 1;
  if (value < 100) return 2;
  return 5;
}

export const INCREMENT_TABLE_COPY = "$1 up to $50, $2 from $51–$99, $5 from $100 up";
