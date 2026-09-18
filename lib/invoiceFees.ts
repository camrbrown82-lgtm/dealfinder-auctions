import type { FulfillmentChoice } from "@/lib/payments";

export const BUYERS_PREMIUM_RATE = 0.15;
export const GST_RATE = 0.05;
export const SHIPPING_HANDLING_FEE = 10;

export const FEE_DISCLOSURE = `BUYER CHARGES: Winning hammers are billed with a 15% house buyer's premium plus 5% GST on the taxable subtotal. Pickup invoices are Hammer + 15% premium + GST. Shipped invoices also add a $10 automatic shipping handling fee plus the actual carrier postage (quoted from weight and dimensions), then GST on that combined subtotal. The $10 handling fee is itemized separately from carrier shipping.`;

export type InvoiceFeeBreakdown = {
  hammer: number;
  premium: number;
  handling: number;
  shipping: number;
  gst: number;
  taxable: number;
  total: number;
  ship: boolean;
};

export function money(value: number | string | null | undefined) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

export function invoiceFees(input: {
  hammer: number;
  fulfillment?: FulfillmentChoice | null;
  shippingCost?: number | null;
  includeHandling?: boolean;
}): InvoiceFeeBreakdown {
  const hammer = money(input.hammer);
  const premium = money(hammer * BUYERS_PREMIUM_RATE);
  const ship = input.fulfillment === "ship";
  const includeHandling = input.includeHandling ?? true;
  const handling = ship && includeHandling ? SHIPPING_HANDLING_FEE : 0;
  const shipping = ship ? money(input.shippingCost ?? 0) : 0;
  const taxable = money(hammer + premium + handling + shipping);
  const gst = money(taxable * GST_RATE);
  return {
    hammer,
    premium,
    handling,
    shipping,
    gst,
    taxable,
    total: money(taxable + gst),
    ship,
  };
}

export function sumInvoiceFees(rows: InvoiceFeeBreakdown[]): InvoiceFeeBreakdown {
  const hammer = money(rows.reduce((sum, row) => sum + row.hammer, 0));
  const premium = money(rows.reduce((sum, row) => sum + row.premium, 0));
  const handling = money(rows.reduce((sum, row) => sum + row.handling, 0));
  const shipping = money(rows.reduce((sum, row) => sum + row.shipping, 0));
  const gst = money(rows.reduce((sum, row) => sum + row.gst, 0));
  const taxable = money(rows.reduce((sum, row) => sum + row.taxable, 0));
  return {
    hammer,
    premium,
    handling,
    shipping,
    gst,
    taxable,
    total: money(rows.reduce((sum, row) => sum + row.total, 0)),
    ship: rows.some((row) => row.ship),
  };
}
