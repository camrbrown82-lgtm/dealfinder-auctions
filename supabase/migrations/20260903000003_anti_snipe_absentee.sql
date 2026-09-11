-- Anti-snipe (final 2 minutes +2) and absentee max bids

alter table public.lots
  add column if not exists high_bidder text;

alter table public.bids
  add column if not exists kind text not null default 'live';

create table if not exists public.absentee_bids (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.lots (id) on delete cascade,
  bidder_name text not null,
  max_amount numeric not null check (max_amount > 0),
  created_at timestamptz not null default now(),
  unique (lot_id, bidder_name)
);

create index if not exists absentee_bids_lot_id_idx on public.absentee_bids (lot_id);

alter table public.absentee_bids enable row level security;

drop policy if exists "public read absentee" on public.absentee_bids;
create policy "public read absentee"
on public.absentee_bids for select
to anon, authenticated
using (true);

drop policy if exists "public upsert absentee" on public.absentee_bids;
create policy "public upsert absentee"
on public.absentee_bids for insert
to anon, authenticated
with check (true);

drop policy if exists "public update absentee" on public.absentee_bids;
create policy "public update absentee"
on public.absentee_bids for update
to anon, authenticated
using (true)
with check (true);

alter table public.absentee_bids replica identity full;

do $$
begin
  begin
    alter publication supabase_realtime add table public.absentee_bids;
  exception when duplicate_object then null;
  end;
end $$;

create or replace function public.validate_and_apply_bid()
returns trigger
language plpgsql
as $$
declare
  lot public.lots%rowtype;
  new_ends timestamptz;
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

  new_ends := lot.ends_at;
  if lot.ends_at - now() <= interval '2 minutes' then
    new_ends := now() + interval '2 minutes';
  end if;

  update public.lots
  set
    current_bid = new.amount,
    high_bidder = new.bidder_name,
    ends_at = new_ends
  where id = new.lot_id;

  return new;
end;
$$;
