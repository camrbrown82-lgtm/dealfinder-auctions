-- Admin auction events + removable inventory

do $$ begin
  alter type public.lot_status add value if not exists 'removed';
exception when duplicate_object then null;
end $$;

create table if not exists public.auction_events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.lots
  add column if not exists event_id uuid references public.auction_events (id) on delete set null;

alter table public.auction_events enable row level security;

drop policy if exists "public read events" on public.auction_events;
create policy "public read events"
on public.auction_events for select
to anon, authenticated
using (true);

drop policy if exists "public write events" on public.auction_events;
create policy "public write events"
on public.auction_events for all
to anon, authenticated
using (true)
with check (true);
