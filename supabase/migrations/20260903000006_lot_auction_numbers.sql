-- Auction numbers + lot numbers for catalog tracking

alter table public.auction_events
  add column if not exists auction_number text;

alter table public.lots
  add column if not exists lot_number text;

create unique index if not exists auction_events_auction_number_uidx
  on public.auction_events (auction_number)
  where auction_number is not null;

create unique index if not exists lots_lot_number_uidx
  on public.lots (lot_number)
  where lot_number is not null;
