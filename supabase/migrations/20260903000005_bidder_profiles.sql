-- Bidder profiles + local payment methods (no card processor).
-- Linked to auth.users. Run in the Supabase SQL editor after Auth is enabled.

do $$ begin
  create type public.payment_method as enum ('interac_etransfer', 'pay_on_arrival');
exception when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text not null default '',
  phone text not null default '',
  street text not null default '',
  city text not null default '',
  province text not null default '',
  postal_code text not null default '',
  payment_method public.payment_method not null default 'interac_etransfer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute procedure public.set_updated_at();

alter table public.lots add column if not exists high_bidder_id uuid;
alter table public.bids add column if not exists bidder_id uuid;

create index if not exists lots_high_bidder_id_idx on public.lots (high_bidder_id);

alter table public.profiles enable row level security;

drop policy if exists "own profile read" on public.profiles;
create policy "own profile read"
on public.profiles for select
to authenticated
using (auth.uid() = id);

drop policy if exists "own profile insert" on public.profiles;
create policy "own profile insert"
on public.profiles for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists "own profile update" on public.profiles;
create policy "own profile update"
on public.profiles for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();
