export type TcTemplateType = "standard" | "high_bid" | "charity" | "custom";

export const TC_TEMPLATE_OPTIONS: Array<{ value: TcTemplateType; label: string }> = [
  { value: "standard", label: "Standard Weekly Auction" },
  { value: "high_bid", label: "High-Bid Auction (8-Hour Extension)" },
  { value: "charity", label: "Charity & Benefit Auction" },
  { value: "custom", label: "Custom Text" },
];

export const TC_TEMPLATE_STANDARD = `1. AUCTION TIMING & BIDDING AGREEMENT
This auction runs on a standard weekly schedule from Monday to Sunday. By placing a bid, you enter into a legally binding contract to purchase the item(s) if you are the winning bidder.

2. PRE-AUTHORIZATION & DEPOSIT
A $50 pre-authorization charge will be placed on your registered credit/debit card upon placing your first bid for this auction. This pre-authorization verifies your payment method and reserves funds toward your final invoice. Charges are settled at the close of the auction on Sunday.

3. PAYMENT & BUYER'S PREMIUM
All winning bids are subject to applicable taxes and standard buyer fees. Full payment must be settled upon auction close via the pre-authorized card on file or approved secondary payment methods.

4. ITEM CONDITION & "AS-IS" SALE
All items are sold "AS-IS, WHERE-IS" with all faults, known or unknown. DealFinder Auctions makes no warranties or guarantees regarding item condition, functionality, or completeness unless explicitly stated in the lot description.

5. PICKUP & REMOVAL
Winning bidders must pick up their items during designated post-auction pickup hours. Failure to retrieve items within the specified timeframe may result in forfeiture of the item and/or storage fees.`;

export const TC_TEMPLATE_HIGH_BID = `1. EXTENDED BIDDING / 8-HOUR ANTI-SNIPING RULE
This auction utilizes an extended soft-close model. If a bid is placed within the final period of the scheduled closing time, the auction deadline for that lot will automatically extend for an additional eight (8) hours. The lot will remain open until an 8-hour window passes with no additional bids placed.

2. BINDING COMMITMENT & AUTOMATED NOTIFICATIONS
Bidders are strongly advised to monitor their active bids or set maximum auto-bids. All extended bids remain firm and legally binding until the final 8-hour extension period expires and a winner is declared.

3. PRE-AUTHORIZATION DEPOSIT
A $50 pre-authorization hold is required upon your first bid for this specific auction. This pre-authorization remains active throughout the duration of all extended bidding periods until final settlement on the Sunday ending cycle.

4. ALL STANDARD SALES TERMS APPLY
All standard payment deadlines, "AS-IS" item condition disclosures, buyer fees, and pickup/removal schedules remain in full effect following the close of the extended bidding period.`;

export const TC_TEMPLATE_CHARITY = `1. CHARITABLE PROCEEDS & PURPOSE
This auction is conducted on behalf of designated charity and fundraising partners. Net proceeds from winning bids are allocated directly to the designated cause/organization specified in the auction details.

2. ALL SALES FINAL & NON-REFUNDABLE
All bids placed are final. Due to the charitable nature of this event, no refunds, returns, or bid retractions will be issued under any circumstances.

3. TAX DEDUCTIBILITY & RECEIPING
Tax receipts (if applicable) will be issued solely by the beneficiary organization in accordance with local tax laws. DealFinder Auctions does not issue tax receipts directly unless explicitly noted in the lot invoice.

4. PRE-AUTHORIZATION & PAYMENT
A $50 pre-authorization hold is processed upon placing your first bid to verify account authenticity. Full payment for winning lots will be charged automatically at the conclusion of the auction.`;

const BY_TYPE: Record<TcTemplateType, string> = {
  standard: TC_TEMPLATE_STANDARD,
  high_bid: TC_TEMPLATE_HIGH_BID,
  charity: TC_TEMPLATE_CHARITY,
  custom: "",
};

export function parseTcTemplateType(value: unknown): TcTemplateType {
  if (value === "high_bid" || value === "charity" || value === "custom" || value === "standard") {
    return value;
  }
  return "standard";
}

export function termsTextFor(type: TcTemplateType) {
  return BY_TYPE[type] ?? TC_TEMPLATE_STANDARD;
}

export function resolvedAuctionTerms(input: {
  tcTemplateType?: TcTemplateType | null;
  termsAndConditions?: string | null;
  bidderTerms?: string | null;
}) {
  const saved = (input.termsAndConditions ?? input.bidderTerms ?? "").trim();
  if (saved) return saved;
  const type = parseTcTemplateType(input.tcTemplateType);
  return termsTextFor(type === "custom" ? "standard" : type);
}
