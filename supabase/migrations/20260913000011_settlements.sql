-- Settlements, saved auction records, and archive flag for inventory cleanup.

alter table public.auction_events
  add column if not exists archived_at timestamptz;

create table if not exists public.settlement_invoices (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.auction_events (id) on delete set null,
  invoice_number text not null,
  buyer_key text not null,
  buyer_name text not null default '',
  email text not null default '',
  phone text not null default '',
  address text not null default '',
  payment_method text not null default '',
  payment_status text not null default 'unpaid',
  shipping_status text not null default 'pending',
  notes text not null default '',
  total numeric not null default 0,
  lots jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint settlement_invoices_payment_check
    check (payment_status in ('unpaid', 'partial', 'paid')),
  constraint settlement_invoices_shipping_check
    check (shipping_status in ('pending', 'ready', 'shipped', 'picked_up'))
);

create unique index if not exists settlement_invoices_invoice_uidx
  on public.settlement_invoices (invoice_number);

create unique index if not exists settlement_invoices_event_buyer_uidx
  on public.settlement_invoices (event_id, buyer_key);

create table if not exists public.settlement_archives (
  id uuid primary key default gen_random_uuid(),
  event_id uuid unique references public.auction_events (id) on delete cascade,
  auction_number text not null default '',
  name text not null default '',
  snapshot jsonb not null default '{}'::jsonb,
  saved_at timestamptz not null default now()
);

alter table public.settlement_invoices enable row level security;
alter table public.settlement_archives enable row level security;

drop policy if exists "staff read settlement invoices" on public.settlement_invoices;
create policy "staff read settlement invoices"
on public.settlement_invoices for select
to anon, authenticated
using (true);

drop policy if exists "staff write settlement invoices" on public.settlement_invoices;
create policy "staff write settlement invoices"
on public.settlement_invoices for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists "staff read settlement archives" on public.settlement_archives;
create policy "staff read settlement archives"
on public.settlement_archives for select
to anon, authenticated
using (true);

drop policy if exists "staff write settlement archives" on public.settlement_archives;
create policy "staff write settlement archives"
on public.settlement_archives for all
to anon, authenticated
using (true)
with check (true);

drop trigger if exists settlement_invoices_set_updated_at on public.settlement_invoices;
create trigger settlement_invoices_set_updated_at
before update on public.settlement_invoices
for each row execute procedure public.set_updated_at();
