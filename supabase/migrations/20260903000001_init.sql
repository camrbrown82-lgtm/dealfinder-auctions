-- DealFinder Auctions — Prompt 2 schema
-- Run in the Supabase SQL editor (or `supabase db push`) after creating a project.

create extension if not exists "pgcrypto";

do $$ begin
  create type public.lot_category as enum ('Comics', 'Toys', 'Vinyl', 'Art', 'Oddities');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.consignment_status as enum ('pending', 'approved', 'held', 'rejected');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.lot_status as enum ('draft', 'live', 'paused', 'ended');
exception when duplicate_object then null;
end $$;

create table if not exists public.consignments (
  id uuid primary key default gen_random_uuid(),
  consignor_name text not null,
  title text not null,
  category public.lot_category not null default 'Oddities',
  condition text,
  description text,
  notes text,
  estimated_low numeric,
  estimated_high numeric,
  image_urls text[] not null default '{}',
  status public.consignment_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lots (
  id uuid primary key default gen_random_uuid(),
  consignment_id uuid references public.consignments (id) on delete set null,
  slug text unique,
  title text not null,
  category public.lot_category not null,
  description text not null default '',
  consignor_name text not null,
  image_url text not null,
  starting_bid numeric not null default 0,
  current_bid numeric not null default 0,
  min_increment numeric not null default 5,
  ends_at timestamptz not null,
  status public.lot_status not null default 'live',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bids (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.lots (id) on delete cascade,
  bidder_name text not null,
  amount numeric not null check (amount > 0),
  created_at timestamptz not null default now()
);

create index if not exists bids_lot_id_created_at_idx on public.bids (lot_id, created_at desc);
create index if not exists lots_status_ends_at_idx on public.lots (status, ends_at);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists consignments_set_updated_at on public.consignments;
create trigger consignments_set_updated_at
before update on public.consignments
for each row execute procedure public.set_updated_at();

drop trigger if exists lots_set_updated_at on public.lots;
create trigger lots_set_updated_at
before update on public.lots
for each row execute procedure public.set_updated_at();

create or replace function public.validate_and_apply_bid()
returns trigger
language plpgsql
as $$
declare
  lot public.lots%rowtype;
begin
  select * into lot from public.lots where id = new.lot_id for update;
  if not found then
    raise exception 'Lot not found';
  end if;
  if lot.status <> 'live' or lot.ends_at <= now() then
    raise exception 'Lot is not open for bidding';
  end if;
  if new.amount < lot.current_bid + lot.min_increment then
    raise exception 'Bid must be at least %', lot.current_bid + lot.min_increment;
  end if;

  update public.lots
  set current_bid = new.amount
  where id = new.lot_id;

  return new;
end;
$$;

drop trigger if exists bids_apply on public.bids;
create trigger bids_apply
before insert on public.bids
for each row execute procedure public.validate_and_apply_bid();

alter table public.consignments enable row level security;
alter table public.lots enable row level security;
alter table public.bids enable row level security;

drop policy if exists "public insert consignments" on public.consignments;
create policy "public insert consignments"
on public.consignments for insert
to anon, authenticated
with check (true);

drop policy if exists "public read consignments" on public.consignments;
create policy "public read consignments"
on public.consignments for select
to anon, authenticated
using (true);

drop policy if exists "public update consignments" on public.consignments;
create policy "public update consignments"
on public.consignments for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "public read lots" on public.lots;
create policy "public read lots"
on public.lots for select
to anon, authenticated
using (true);

drop policy if exists "public update lots" on public.lots;
create policy "public update lots"
on public.lots for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "public insert lots" on public.lots;
create policy "public insert lots"
on public.lots for insert
to anon, authenticated
with check (true);

drop policy if exists "public read bids" on public.bids;
create policy "public read bids"
on public.bids for select
to anon, authenticated
using (true);

drop policy if exists "public insert bids" on public.bids;
create policy "public insert bids"
on public.bids for insert
to anon, authenticated
with check (true);

alter table public.lots replica identity full;
alter table public.bids replica identity full;
alter table public.consignments replica identity full;

do $$
begin
  begin
    alter publication supabase_realtime add table public.lots;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.bids;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.consignments;
  exception when duplicate_object then null;
  end;
end $$;

insert into storage.buckets (id, name, public)
values ('consignment-images', 'consignment-images', true)
on conflict (id) do nothing;

drop policy if exists "public read consignment images" on storage.objects;
create policy "public read consignment images"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'consignment-images');

drop policy if exists "public upload consignment images" on storage.objects;
create policy "public upload consignment images"
on storage.objects for insert
to anon, authenticated
with check (bucket_id = 'consignment-images');

insert into public.lots (
  id, slug, title, category, description, consignor_name, image_url,
  starting_bid, current_bid, min_increment, ends_at, status
)
values
  (
    '00000000-0000-4000-8000-000000000001',
    'pow-001',
    'Silver Age Amazing #15 reprint folio',
    'Comics',
    'Bright cover, crisp corners, bagged and boarded.',
    'Vault Comics Co.',
    'https://images.unsplash.com/photo-1612036782180-6f0b6cd846fe?auto=format&fit=crop&w=800&q=80',
    240, 240, 10, now() + interval '42 minutes', 'live'
  ),
  (
    '00000000-0000-4000-8000-000000000002',
    'zap-014',
    'Wind-up robot, original box',
    'Toys',
    'Working key-wind mechanism. Box shows shelf wear.',
    'Attic Finds',
    'https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?auto=format&fit=crop&w=800&q=80',
    85, 85, 5, now() + interval '18 minutes', 'live'
  ),
  (
    '00000000-0000-4000-8000-000000000003',
    'bam-077',
    '1960s jazz LP lot (sealed-looking)',
    'Vinyl',
    'Four-record stack. Surfaces look glossy under light.',
    'Spin City',
    'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=800&q=80',
    120, 120, 10, now() + interval '95 minutes', 'live'
  ),
  (
    '00000000-0000-4000-8000-000000000004',
    'wham-003',
    'Hand-painted pulp poster',
    'Art',
    'Gesso on board. Halftone dots still punchy.',
    'Poster Palace',
    'https://images.unsplash.com/photo-1547891654-e66ed7ebb968?auto=format&fit=crop&w=800&q=80',
    310, 310, 25, now() + interval '210 minutes', 'live'
  ),
  (
    '00000000-0000-4000-8000-000000000005',
    'kapow-9',
    'Mystery crate: dime-store oddities',
    'Oddities',
    'Unsorted lot. What you see is what you get.',
    'Curious Cabinets',
    'https://images.unsplash.com/photo-1513885535751-8b9238bd345a?auto=format&fit=crop&w=800&q=80',
    45, 45, 5, now() + interval '8 minutes', 'live'
  )
on conflict (id) do nothing;

insert into public.consignments (
  id, consignor_name, title, category, description, status
)
values
  (
    '00000000-0000-4000-8000-000000000101',
    'Vault Comics Co.',
    'Bronze Age long box (unsorted)',
    'Comics',
    'Awaiting sort and pull.',
    'pending'
  ),
  (
    '00000000-0000-4000-8000-000000000102',
    'Attic Finds',
    'Die-cast cars, 12-count tray',
    'Toys',
    'Mixed scales, some chrome wear.',
    'pending'
  ),
  (
    '00000000-0000-4000-8000-000000000103',
    'Spin City',
    '45s crate — soul / funk',
    'Vinyl',
    'Hold for grading.',
    'held'
  )
on conflict (id) do nothing;
