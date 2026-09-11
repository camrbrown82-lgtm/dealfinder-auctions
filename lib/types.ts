export const CATEGORIES = ["All", "Comics", "Toys", "Vinyl", "Art", "Oddities"] as const;
export type Category = Exclude<(typeof CATEGORIES)[number], "All">;

export const PROVINCES = [
  "AB",
  "BC",
  "MB",
  "NB",
  "NL",
  "NS",
  "NT",
  "NU",
  "ON",
  "PE",
  "QC",
  "SK",
  "YT",
] as const;

export type PaymentMethod = "interac_etransfer" | "pay_on_arrival";
export type LotStatus = "draft" | "pending_approval" | "live" | "paused" | "ended" | "sold" | "removed";
export type BidderStatus = "active" | "suspended";
export type BidKind = "live" | "absentee" | "absentee auto";

export type ProfileFields = {
  fullName: string;
  phone: string;
  street: string;
  city: string;
  province: string;
  postalCode: string;
  paymentMethod: PaymentMethod;
};

export type User = ProfileFields & {
  id: string;
  email: string;
  passwordHash: string;
  status: BidderStatus;
  auctionsWon: number;
  lifetimeSpend: number;
  paymentFlag: string;
  createdAt: string;
};

export type PublicUser = Omit<User, "passwordHash">;

export type AuctionEvent = {
  id: string;
  name: string;
  auctionNumber: string;
  startsAt: string;
  endsAt: string;
};

export type Lot = {
  id: string;
  slug: string;
  title: string;
  category: Category;
  image: string;
  images: string[];
  description: string;
  consignor: string;
  currentBid: number;
  startingBid: number;
  reserve: number;
  estimatedValue: number;
  minIncrement: number;
  commissionRate: number;
  endsAt: string;
  status: LotStatus;
  pipelineStatus: LotStatus;
  lotNumber: string;
  auctionNumber: string;
  auctionId: string;
  highBidder: string | null;
  highBidderId: string | null;
  bidCount: number;
  absenteeMax: Record<string, number>;
};

export type Bid = {
  id: string;
  lotId: string;
  bidderId: string | null;
  bidder: string;
  email: string;
  amount: number;
  kind: BidKind;
  createdAt: string;
  voided: boolean;
};

export type EmailTemplate = {
  id: string;
  name: string;
  subject: string;
  body: string;
};

export type EmailOutboxItem = {
  id: string;
  to: string;
  subject: string;
  body: string;
  createdAt: string;
};

export type StoreData = {
  users: User[];
  lots: Lot[];
  bids: Bid[];
  events: AuctionEvent[];
  templates: EmailTemplate[];
  outbox: EmailOutboxItem[];
  emailLogo: string | null;
};
