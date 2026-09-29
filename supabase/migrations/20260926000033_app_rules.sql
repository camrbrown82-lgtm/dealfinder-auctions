-- Official rules Turbo Sloth reads before answering. Service role only.

create table if not exists public.app_rules (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  category text not null,
  title text not null,
  body text not null,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.app_rules enable row level security;

insert into public.app_rules (slug, category, title, body, sort_order)
values
  (
    'sunday-card-hold',
    'fees',
    '$50 Sunday card hold',
    $rule$The $50 is not a setup fee and it is not the hammer. On Sunday, the day the auction ends, DealFinder places a $50 pre-authorization on the bidder's card. It is a hold, not a charge. It confirms the card is valid. After the bidder agrees, they can bid all week without being billed for the hammer. The hammer is charged only at Helcim checkout, and the $50 hold is reversed once that sale goes through. If the Sunday hold is denied or checkout payment does not go through, those bids are forfeited.$rule$,
    10
  ),
  (
    'buyer-invoice-fees',
    'fees',
    'Buyer invoice fees',
    $rule$Winning hammers are billed with a 15% house buyer's premium plus 5% GST on the taxable subtotal. Pickup invoices are Hammer + 15% premium + GST. Shipped invoices also add a $10 automatic shipping handling fee plus the actual carrier postage quoted from weight and dimensions, then GST on that combined subtotal. The $10 handling fee is itemized separately from carrier shipping.$rule$,
    20
  ),
  (
    'fee-waiver',
    'fees',
    'Fee waivers',
    $rule$A bidder cannot waive the buyer's premium, GST, shipping handling fee, or consignor commission on their own. The only admin requests that change money terms are: cash-on-pickup approval by the desk, and Trusted Client status granted by management for a higher Buy Now limit. Do not promise any other fee waiver.$rule$,
    30
  ),
  (
    'cash-pickup',
    'fees',
    'Cash pick-up',
    $rule$Cash on pickup is allowed only after the desk approves it. After the hammer closes, the bidder can request cash on that invoice. Staff approve or reject the request. Until it is approved, the invoice is not paid. Cash bidding before the sale is also gated: the desk must approve that auction, or the bidder must already be a trusted cash user.$rule$,
    40
  ),
  (
    'consignor-commission',
    'consignment',
    'Consignor commission',
    $rule$Consignors do not choose a commission. Apply these tiers to the price the lot actually sells for.
Tier 1: For lots sold at or below $20: A commission rate of 50% will apply.
Tier 2: For lots sold between $21 and $49: A commission rate of $10 will apply.
Tier 3: For lots sold above $50 and below $500: A commission rate of 20% will apply. A sale of $50 uses this 20% tier.
Tier 4: For lots sold at or above $500: A commission rate of 15% will apply.
This commission is not the buyer's 15% premium.$rule$,
    50
  ),
  (
    'consignment-clauses',
    'consignment',
    'Other consignment clauses',
    $rule$Reserve prices may be agreed in writing and may carry a $10 reserve fee if unsold. A consignor may withdraw an item up to 2 weeks before the auction start, or if it has no bid, with written agreement and a $10 withdrawal fee per item. Collected sale proceeds are remitted within 21 days, less commission and applicable fees. If a winning bidder does not pay, the sale is voided and the item is relisted; the consignor is paid when it resells and is paid in full. Items are insured for 10% of MSRP. Unsold unreserved items may be donated to a local charity or disposed of unless both parties agree otherwise. Paid items uncollected for 30 days after the auction closes revert to the Auction House, and the consignor keeps the proceeds already paid.$rule$,
    60
  ),
  (
    'auction-regular',
    'auction_type',
    'Regular weekly auction',
    $rule$A regular auction is the standard weekly sale, Monday through Sunday. Only the current week's auction accepts bids. Up to two earlier weeks are view only. Later weeks are upcoming and view only. A bid in the last 2 minutes extends that lot's clock by 2 minutes. The next bid step is $1 under $51, $2 from $51 to $99, and $5 at $100 and above. Max Bid is the most the bidder will pay; the app bids only as far as the next step requires.$rule$,
    70
  ),
  (
    'auction-high-value',
    'auction_type',
    'High-value auction',
    $rule$A high-value auction uses the high-bid terms: an 8-hour soft close. If a bid is placed in the final period before the scheduled close, that lot extends for another 8 hours and stays open until an 8-hour window passes with no new bid. The $50 card hold, 15% buyer's premium, 5% GST, and shipping fees still apply. This is not the regular 2-minute extension.$rule$,
    80
  ),
  (
    'auction-charity',
    'auction_type',
    'Charity auction',
    $rule$A charity auction is run for a named charity or fundraising partner. Net proceeds from winning bids go to that cause. Bids are final: no refunds, returns, or bid retractions. Tax receipts, if any, come from the beneficiary organization, not from DealFinder, unless the invoice says otherwise. The $50 card hold, 15% buyer's premium, 5% GST, and shipping fees still apply.$rule$,
    90
  )
on conflict (slug) do update
set
  category = excluded.category,
  title = excluded.title,
  body = excluded.body,
  sort_order = excluded.sort_order,
  updated_at = now();
