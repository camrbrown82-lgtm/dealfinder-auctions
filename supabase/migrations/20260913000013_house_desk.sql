-- House catalog defaults: sticky starting bid and the next warehouse lot number.

create table if not exists public.house_desk_settings (
  id integer primary key default 1 check (id = 1),
  default_starting_bid numeric not null default 5,
  next_lot_seq integer not null default 1,
  updated_at timestamptz not null default now()
);

insert into public.house_desk_settings (id, default_starting_bid, next_lot_seq)
values (1, 5, 1)
on conflict (id) do nothing;

update public.house_desk_settings
set next_lot_seq = greatest(
  next_lot_seq,
  coalesce(
    (
      select max(
        case
          when lot_number ~ '^[0-9]+$' then lot_number::integer
          when lot_number ~* '^lot-[0-9]+$' then substring(lot_number from '[0-9]+$')::integer
          else 0
        end
      )
      from public.lots
    ),
    0
  ) + 1
)
where id = 1;

alter table public.house_desk_settings enable row level security;

drop policy if exists "staff read house desk settings" on public.house_desk_settings;
create policy "staff read house desk settings"
on public.house_desk_settings for select
to anon, authenticated
using (true);

drop policy if exists "staff write house desk settings" on public.house_desk_settings;
create policy "staff write house desk settings"
on public.house_desk_settings for all
to anon, authenticated
using (true)
with check (true);
