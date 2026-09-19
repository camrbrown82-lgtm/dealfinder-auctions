-- SQL editor: designated Buy Now channel
-- Project: DealFinder Auctions (zuqclcibzhguwbmelger)

alter table public.lots
  add column if not exists sale_channel text not null default 'auction';

alter table public.lots
  drop constraint if exists lots_sale_channel_check;

alter table public.lots
  add constraint lots_sale_channel_check
  check (sale_channel in ('auction', 'buy_now'));

alter table public.lots
  add column if not exists buy_now_status text;

alter table public.lots
  drop constraint if exists lots_buy_now_status_check;

alter table public.lots
  add constraint lots_buy_now_status_check
  check (buy_now_status is null or buy_now_status in ('pending_approval', 'listed', 'sold'));

alter table public.consignments
  add column if not exists sale_channel text not null default 'auction';

alter table public.consignments
  drop constraint if exists consignments_sale_channel_check;

alter table public.consignments
  add constraint consignments_sale_channel_check
  check (sale_channel in ('auction', 'buy_now'));

create index if not exists lots_sale_channel_status_idx
  on public.lots (sale_channel, buy_now_status);
