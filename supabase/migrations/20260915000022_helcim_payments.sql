-- Helcim card checkout + $50 bidding pre-authorization.
-- Run in the Supabase SQL editor BEFORE redeploy. Split into two queries if
-- PostgreSQL refuses to use the new enum value in the same transaction.

-- Query 1 (enum). Skip this block if you already converted payment_method to text.
do $$ begin
  alter type public.payment_method add value 'helcim_card';
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

-- Query 2 (schema + data). Run after Query 1 has committed.
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
