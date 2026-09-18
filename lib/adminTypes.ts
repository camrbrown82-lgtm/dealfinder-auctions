export type AdminBid = {
  id: string;
  lotId: string;
  bidder: string;
  email: string;
  amount: number;
  kind: "live" | "absentee";
  createdAt: string;
  bidderId?: string | null;
};

export type MonitorLot = {
  id: string;
  title: string;
  lotNumber?: string | null;
  auctionNumber?: string | null;
  status?: string;
  highBidder: string | null;
  currentBid: number;
  startingBid: number;
  reservePrice: number;
  buyNowPrice: number;
  endsAt: string;
  bidCount: number;
};

export type CustomerRow = {
  id: string;
  email: string;
  fullName: string;
  status: "active" | "suspended";
  phone: string;
  street?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  paymentMethod: string;
  auctionsWon: number;
  lifetimeSpend: number;
  paymentFlag: string;
  trustedCashUser?: boolean;
  isTrustedBuyer?: boolean;
  buyNowLimit?: number | null;
};
