-- DealFinder Auctions schema
-- Run this in the Supabase SQL editor if you are creating tables from scratch.
-- If you already created tables, compare column names and add any missing ones.

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  full_name text not null default '',
  phone text not null default '',
  street text not null default '',
  city text not null default '',
  province text not null default 'AB',
  postal_code text not null default '',
  payment_method text not null default 'interac_etransfer',
  status text not null default 'active',
  auctions_won integer not null default 0,
  lifetime_spend numeric not null default 0,
  payment_flag text not null default 'clear',
  created_at timestamptz not null default now()
);

create table if not exists public.auction_events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  auction_number text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null
);

create table if not exists public.lots (
  id text primary key,
  slug text unique not null,
  title text not null,
  category text not null,
  image text,
  images text[] not null default '{}',
  description text not null default '',
  consignor text not null,
  current_bid numeric not null default 0,
  starting_bid numeric not null default 0,
  reserve numeric not null default 0,
  estimated_value numeric not null default 0,
  min_increment numeric not null default 10,
  commission_rate numeric not null default 0.20,
  ends_at timestamptz not null,
  status text not null default 'draft',
  pipeline_status text not null default 'draft',
  lot_number text not null,
  auction_number text,
  auction_id uuid references public.auction_events(id),
  high_bidder text,
  high_bidder_id uuid,
  bid_count integer not null default 0,
  absentee_max jsonb not null default '{}'::jsonb
);

create table if not exists public.bids (
  id uuid primary key default gen_random_uuid(),
  lot_id text not null references public.lots(id) on delete cascade,
  bidder_id uuid,
  bidder_name text,
  email text,
  amount numeric not null,
  kind text not null default 'live',
  created_at timestamptz not null default now(),
  voided boolean not null default false
);

create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subject text not null,
  body text not null
);

alter table public.lots enable row level security;
alter table public.bids enable row level security;
alter table public.profiles enable row level security;
alter table public.auction_events enable row level security;
alter table public.email_templates enable row level security;

-- Public floor reads (skip these if you already have matching policies)
-- create policy "public read live lots" on public.lots for select using (status = 'live');
-- create policy "public read bids" on public.bids for select using (true);

-- Enable realtime for the live floor
-- alter publication supabase_realtime add table public.bids;
-- alter publication supabase_realtime add table public.lots;
