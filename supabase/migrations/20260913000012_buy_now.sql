-- Buy now price (replaces reserve). Keep reserve_price in sync for older rows.

alter table public.lots
  add column if not exists buy_now_price numeric;

alter table public.consignments
  add column if not exists buy_now_price numeric;

update public.lots
set buy_now_price = reserve_price
where buy_now_price is null and reserve_price is not null;

update public.consignments
set buy_now_price = reserve_price
where buy_now_price is null and reserve_price is not null;
