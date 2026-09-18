-- Paste into the Supabase SQL editor (one shot).
-- Per-auction bidder terms + Sunday $50 pre-auth agreement records.

alter table public.auction_events
  add column if not exists bidder_terms text;

create table if not exists public.auction_registrations (
  user_id uuid not null references public.profiles (id) on delete cascade,
  event_id uuid not null references public.auction_events (id) on delete cascade,
  terms_agreed_at timestamptz not null default now(),
  preauth_agreed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (user_id, event_id)
);

create index if not exists auction_registrations_event_idx
  on public.auction_registrations (event_id);

alter table public.auction_registrations enable row level security;

grant select, insert, update, delete on public.auction_registrations to service_role;
