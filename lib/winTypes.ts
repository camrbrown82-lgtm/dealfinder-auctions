export type WinInvoice = {
  lotId: string;
  title: string;
  slug?: string | null;
  currentBid: number;
  status?: string;
  invoice: string;
  paymentMethod: string;
  paymentMethodKey: "helcim_card";
  instructions: string;
  winning: boolean;
  fulfillment: "unset" | "ship" | "pickup";
  address: string;
  paid: boolean;
  paidAt?: string | null;
};
