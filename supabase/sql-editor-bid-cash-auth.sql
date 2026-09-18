-- DealFinder: trusted cash bidders + per-auction bid authorization
-- Paste into the Supabase SQL editor and run once.

alter table public.profiles
  add column if not exists trusted_cash_user boolean not null default false;

alter table public.auction_registrations
  add column if not exists payment_method text;

alter table public.auction_registrations
  add column if not exists auth_status text not null default 'none';

alter table public.auction_registrations
  drop constraint if exists auction_registrations_auth_status_check;

alter table public.auction_registrations
  add constraint auction_registrations_auth_status_check
  check (auth_status in ('none', 'pending', 'approved', 'rejected'));

create index if not exists auction_registrations_auth_status_idx
  on public.auction_registrations (auth_status);
