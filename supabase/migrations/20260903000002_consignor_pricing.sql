-- Consignor portal pricing fields (Prompt 3)

alter table public.consignments
  add column if not exists reserve_price numeric,
  add column if not exists starting_bid numeric,
  add column if not exists commission_rate numeric not null default 0.20;
