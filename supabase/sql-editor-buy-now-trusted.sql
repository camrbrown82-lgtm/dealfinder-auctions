-- SQL editor: Buy-Now credit tiers + Sunday batch invoicing
-- Project: DealFinder Auctions

alter table public.profiles
  add column if not exists is_trusted_buyer boolean not null default false;

alter table public.profiles
  add column if not exists buy_now_limit numeric;

alter table public.lots
  add column if not exists sale_source text not null default 'bid';

alter table public.lots
  drop constraint if exists lots_sale_source_check;

alter table public.lots
  add constraint lots_sale_source_check
  check (sale_source in ('bid', 'buy_now'));

alter table public.auction_events
  add column if not exists invoice_batch_sent_at timestamptz;

create table if not exists public.pending_invoice_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  event_id uuid references public.auction_events (id) on delete set null,
  lot_id uuid not null references public.lots (id) on delete cascade,
  hammer numeric not null,
  source text not null default 'bid',
  reservation_email_sent_at timestamptz,
  invoiced_at timestamptz,
  created_at timestamptz not null default now(),
  unique (lot_id)
);

alter table public.pending_invoice_items
  drop constraint if exists pending_invoice_items_source_check;

alter table public.pending_invoice_items
  add constraint pending_invoice_items_source_check
  check (source in ('bid', 'buy_now'));

create index if not exists pending_invoice_items_user_event_idx
  on public.pending_invoice_items (user_id, event_id);

alter table public.pending_invoice_items enable row level security;

alter table public.settlement_invoices
  add column if not exists batch_invoice_sent_at timestamptz;
