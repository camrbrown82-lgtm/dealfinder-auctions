-- Buy Now consignments: the consignor's offer is what they are paid.
-- The public buy_now_price is what buyers pay. DealFinder keeps the difference.

alter table public.consignments add column if not exists consignor_offer numeric;
alter table public.consignments add column if not exists agreed_payout numeric;
alter table public.lots add column if not exists consignor_payout numeric;
