export type WinInvoice = {
  lotId: string;
  title: string;
  slug?: string | null;
  currentBid: number;
  status?: string;
  invoice: string;
  paymentMethod: string;
  paymentMethodKey: "interac_etransfer" | "pay_on_arrival";
  instructions: string;
  winning: boolean;
};
