export type WinInvoice = {
  lotId: string;
  title: string;
  slug?: string | null;
  currentBid: number;
  premium: number;
  handling: number;
  shippingCost: number;
  gst: number;
  total: number;
  status?: string;
  invoice: string;
  paymentMethod: string;
  paymentMethodKey: "helcim_card";
  instructions: string;
  winning: boolean;
  fulfillment: "unset" | "ship" | "pickup";
  address: string;
  buyerName: string;
  phone: string;
  paid: boolean;
  paidAt?: string | null;
  payment?: "unpaid" | "partial" | "paid" | "cash_pending";
  paymentChannel?: "helcim" | "cash";
  invoiceReady?: boolean;
  lotNumber?: string | null;
  image?: string | null;
  receiptUrl?: string | null;
};

/** Settled on the pickup desk: cash is collected at the counter, not online. */
export function isCashOnPickup(win: WinInvoice) {
  return !win.paid && win.payment !== "cash_pending" && win.paymentChannel === "cash";
}
