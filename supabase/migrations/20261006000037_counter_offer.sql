-- A Buy Now counter is offered when the desk rejects the consignment.
-- The consignor accepts or declines it on their dashboard.

alter table public.consignments add column if not exists counter_offer numeric;
alter table public.consignments add column if not exists counter_status text;
