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

3. PAYMENT, BUYER'S PREMIUM, TAX & SHIPPING
A 15% house buyer's premium is added to every winning hammer. Alberta 5% GST is charged on the taxable subtotal. Pickup invoices equal Hammer + 15% premium + GST. Shipped invoices also include a $10 automatic shipping handling fee (itemized separately) plus the actual carrier postage quoted from weight and dimensions, then GST. Full payment must be settled upon auction close via the pre-authorized card on file or Helcim checkout.

4. ITEM CONDITION & "AS-IS" SALE
All items are sold "AS-IS, WHERE-IS" with all faults, known or unknown. DealFinder Auctions makes no warranties or guarantees regarding item condition, functionality, or completeness unless explicitly stated in the lot description.

5. PICKUP & REMOVAL
Winning bidders must pick up their items during designated post-auction pickup hours. Failure to retrieve items within the specified timeframe may result in forfeiture of the item and/or storage fees.

6. BUY-NOW PURCHASES & CONSOLIDATED INVOICING
All items acquired via the "Buy-Now" feature are immediately reserved and marked as sold to the buyer. Payment is not processed at the moment of purchase. All Buy-Now purchases are consolidated onto your single, end-of-auction invoice issued at the conclusion of the Sunday auction cycle. First-time and standard registered bidders are limited to a maximum aggregate of $50 in Buy-Now purchases per auction cycle prior to auction close, backed by the $50 account pre-authorization hold. Bidders in good standing may request "Trusted Client" status through management to unlock elevated or unlimited Buy-Now purchasing limits. Selecting "Buy-Now" constitutes a firm, non-cancelable purchase agreement. Failure to settle consolidated invoices at auction close will result in account suspension and forfeiture of pre-authorization deposits.`;

export const TC_TEMPLATE_HIGH_BID = `1. EXTENDED BIDDING / 8-HOUR ANTI-SNIPING RULE
This auction utilizes an extended soft-close model. If a bid is placed within the final period of the scheduled closing time, the auction deadline for that lot will automatically extend for an additional eight (8) hours. The lot will remain open until an 8-hour window passes with no additional bids placed.

2. BINDING COMMITMENT & AUTOMATED NOTIFICATIONS
Bidders are strongly advised to monitor their active bids or set maximum auto-bids. All extended bids remain firm and legally binding until the final 8-hour extension period expires and a winner is declared.

3. PRE-AUTHORIZATION DEPOSIT
A $50 pre-authorization hold is required upon your first bid for this specific auction. This pre-authorization remains active throughout the duration of all extended bidding periods until final settlement on the Sunday ending cycle.

4. ALL STANDARD SALES TERMS APPLY
All standard payment deadlines, "AS-IS" item condition disclosures, 15% buyer's premium, 5% GST, $10 shipping handling fee plus carrier postage on shipped lots, and pickup/removal schedules remain in full effect following the close of the extended bidding period.

5. BUY-NOW PURCHASES & CONSOLIDATED INVOICING
All items acquired via the "Buy-Now" feature are immediately reserved and marked as sold to the buyer. Payment is not processed at the moment of purchase. All Buy-Now purchases are consolidated onto your single, end-of-auction invoice issued at the conclusion of the Sunday auction cycle. First-time and standard registered bidders are limited to a maximum aggregate of $50 in Buy-Now purchases per auction cycle prior to auction close, backed by the $50 account pre-authorization hold. Bidders in good standing may request "Trusted Client" status through management to unlock elevated or unlimited Buy-Now purchasing limits. Selecting "Buy-Now" constitutes a firm, non-cancelable purchase agreement. Failure to settle consolidated invoices at auction close will result in account suspension and forfeiture of pre-authorization deposits.`;

export const TC_TEMPLATE_CHARITY = `1. CHARITABLE PROCEEDS & PURPOSE
This auction is conducted on behalf of designated charity and fundraising partners. Net proceeds from winning bids are allocated directly to the designated cause/organization specified in the auction details.

2. ALL SALES FINAL & NON-REFUNDABLE
All bids placed are final. Due to the charitable nature of this event, no refunds, returns, or bid retractions will be issued under any circumstances.

3. TAX DEDUCTIBILITY & RECEIPING
Tax receipts (if applicable) will be issued solely by the beneficiary organization in accordance with local tax laws. DealFinder Auctions does not issue tax receipts directly unless explicitly noted in the lot invoice.

4. PRE-AUTHORIZATION & PAYMENT
A $50 pre-authorization hold is processed upon placing your first bid to verify account authenticity. Full payment for winning lots will be charged automatically at the conclusion of the auction, including the 15% buyer's premium, 5% GST, and — if you choose shipping — a $10 handling fee plus actual carrier postage.

5. BUY-NOW PURCHASES & CONSOLIDATED INVOICING
All items acquired via the "Buy-Now" feature are immediately reserved and marked as sold to the buyer. Payment is not processed at the moment of purchase. All Buy-Now purchases are consolidated onto your single, end-of-auction invoice issued at the conclusion of the Sunday auction cycle. First-time and standard registered bidders are limited to a maximum aggregate of $50 in Buy-Now purchases per auction cycle prior to auction close, backed by the $50 account pre-authorization hold. Bidders in good standing may request "Trusted Client" status through management to unlock elevated or unlimited Buy-Now purchasing limits. Selecting "Buy-Now" constitutes a firm, non-cancelable purchase agreement. Failure to settle consolidated invoices at auction close will result in account suspension and forfeiture of pre-authorization deposits.`;

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
  const type = parseTcTemplateType(input.tcTemplateType);
  const text = saved || termsTextFor(type === "custom" ? "standard" : type);
  if (/buy-now purchases/i.test(text)) return text;
  return `${text.trim()}\n\n6. BUY-NOW PURCHASES & CONSOLIDATED INVOICING
All items acquired via the "Buy-Now" feature are immediately reserved and marked as sold to the buyer. Payment is not processed at the moment of purchase. All Buy-Now purchases are consolidated onto your single, end-of-auction invoice issued at the conclusion of the Sunday auction cycle. First-time and standard registered bidders are limited to a maximum aggregate of $50 in Buy-Now purchases per auction cycle prior to auction close, backed by the $50 account pre-authorization hold. Bidders in good standing may request "Trusted Client" status through management to unlock elevated or unlimited Buy-Now purchasing limits. Selecting "Buy-Now" constitutes a firm, non-cancelable purchase agreement. Failure to settle consolidated invoices at auction close will result in account suspension and forfeiture of pre-authorization deposits.`;
}
