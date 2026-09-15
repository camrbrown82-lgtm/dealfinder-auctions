-- =============================================================================
-- DealFinder / Helcim — paste into the Supabase SQL editor
-- Run QUERY 1, wait for success, then QUERY 2, then QUERY 3.
-- =============================================================================

-- QUERY 1 — add Helcim to the payment_method enum (must commit before Query 2)
do $$ begin
  alter type public.payment_method add value 'helcim_card';
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

-- QUERY 2 — switch profiles to Helcim, add pre-auth + checkout columns
alter table public.profiles
  alter column payment_method drop default;

alter table public.profiles
  alter column payment_method type text using (
    case
      when payment_method::text in ('interac_etransfer', 'pay_on_arrival') then 'helcim_card'
      when payment_method::text = 'helcim_card' then 'helcim_card'
      else 'helcim_card'
    end
  );

alter table public.profiles
  alter column payment_method set default 'helcim_card';

update public.profiles
set payment_method = 'helcim_card'
where payment_method is distinct from 'helcim_card';

alter table public.profiles
  add column if not exists helcim_card_token text,
  add column if not exists helcim_customer_code text,
  add column if not exists preauth_transaction_id text,
  add column if not exists preauth_status text not null default 'none',
  add column if not exists preauth_amount numeric not null default 50,
  add column if not exists preauth_held_at timestamptz,
  add column if not exists preauth_released_at timestamptz;

alter table public.lots
  add column if not exists paid_at timestamptz,
  add column if not exists helcim_purchase_transaction_id text;

create table if not exists public.helcim_sessions (
  checkout_token text primary key,
  secret_token text not null,
  bidder_id uuid not null,
  purpose text not null,
  lot_id uuid,
  amount numeric not null,
  currency text not null default 'CAD',
  invoice_number text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.helcim_transactions (
  id uuid primary key default gen_random_uuid(),
  bidder_id uuid not null,
  lot_id uuid,
  purpose text not null,
  transaction_id text,
  card_token text,
  customer_code text,
  amount numeric not null,
  currency text not null default 'CAD',
  status text not null,
  raw jsonb,
  created_at timestamptz not null default now()
);

create index if not exists helcim_transactions_bidder_idx
  on public.helcim_transactions (bidder_id, created_at desc);

create index if not exists lots_paid_at_idx on public.lots (paid_at);

alter table public.helcim_sessions enable row level security;
alter table public.helcim_transactions enable row level security;

-- QUERY 3 — Sunday pre-auth agreement checkbox (run after Query 2)
alter table public.profiles
  add column if not exists preauth_terms_agreed_at timestamptz;
