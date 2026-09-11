-- Ops command center: bidder status, lot reserve, email templates, bid audit columns

alter table public.profiles
  add column if not exists status text not null default 'active';

alter table public.profiles
  drop constraint if exists profiles_status_check;

alter table public.profiles
  add constraint profiles_status_check
  check (status in ('active', 'suspended'));

alter table public.lots
  add column if not exists reserve_price numeric;

alter table public.lots
  add column if not exists starting_bid numeric;

alter table public.bids
  add column if not exists bidder_email text;

create table if not exists public.email_templates (
  id text primary key,
  name text not null,
  subject text not null,
  body text not null,
  updated_at timestamptz not null default now()
);

alter table public.email_templates enable row level security;

drop policy if exists "staff read templates" on public.email_templates;
create policy "staff read templates"
on public.email_templates for select
to anon, authenticated
using (true);

drop policy if exists "staff write templates" on public.email_templates;
create policy "staff write templates"
on public.email_templates for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists "public insert bids" on public.bids;
create policy "insert bids unless suspended"
on public.bids for insert
to authenticated
with check (
  not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.status = 'suspended'
  )
);

drop policy if exists "service delete bids" on public.bids;
create policy "authenticated delete bids"
on public.bids for delete
to authenticated
using (true);
