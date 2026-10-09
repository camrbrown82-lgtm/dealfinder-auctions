-- SQL editor: eBay cross-post (one house seller login + listing stamps)
-- Project: DealFinder Auctions

create table if not exists public.ebay_connections (
  id integer primary key default 1 check (id = 1),
  ebay_user_id text,
  ebay_username text,
  access_token text not null,
  refresh_token text not null,
  access_expires_at timestamptz not null,
  marketplace_id text not null default 'EBAY_CA',
  merchant_location_key text,
  fulfillment_policy_id text,
  payment_policy_id text,
  return_policy_id text,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ebay_connections enable row level security;

alter table public.lots add column if not exists ebay_listing_id text;
alter table public.lots add column if not exists ebay_offer_id text;
alter table public.lots add column if not exists ebay_sku text;
alter table public.lots add column if not exists ebay_listing_url text;
alter table public.lots add column if not exists ebay_listed_at timestamptz;
