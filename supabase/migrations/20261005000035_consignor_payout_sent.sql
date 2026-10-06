-- Record when a consignor was actually paid, and let them archive finished
-- rows off the portal after they export the spreadsheet.

alter table public.lots
  add column if not exists payout_sent_at timestamptz,
  add column if not exists payout_amount numeric not null default 0,
  add column if not exists payout_method text not null default '',
  add column if not exists payout_reference text not null default '',
  add column if not exists consignor_cleared_at timestamptz;

alter table public.consignments
  add column if not exists consignor_cleared_at timestamptz;

create index if not exists lots_payout_sent_at_idx on public.lots (payout_sent_at);
create index if not exists lots_consignor_cleared_at_idx on public.lots (consignor_cleared_at);
create index if not exists consignments_consignor_cleared_at_idx on public.consignments (consignor_cleared_at);
