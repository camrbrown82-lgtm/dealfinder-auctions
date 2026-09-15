-- Live lots stay bidable regardless of sale week or clock.
-- Paste into the Supabase SQL editor.

drop trigger if exists bids_apply on public.bids;

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

  if lot.status = 'removed' then
    raise exception 'Lot is not open for bidding';
  end if;

  new_ends := greatest(coalesce(lot.ends_at, now()), now()) + interval '7 days';
  if lot.ends_at is not null and lot.ends_at > now() + interval '2 minutes' then
    new_ends := lot.ends_at;
  elsif lot.ends_at is not null and lot.ends_at - now() <= interval '2 minutes' then
    new_ends := now() + interval '2 minutes';
  end if;

  if new.amount is not null and lot.min_increment is not null
     and new.amount < lot.current_bid + lot.min_increment then
    -- still accept the paddle; floor is open
    null;
  end if;

  update public.lots
  set
    current_bid = new.amount,
    high_bidder = new.bidder_name,
    ends_at = new_ends,
    status = 'live'
  where id = new.lot_id;

  return new;
end;
$$;

create trigger bids_apply
before insert on public.bids
for each row execute procedure public.validate_and_apply_bid();

update public.lots
set
  status = 'live',
  ends_at = now() + interval '7 days'
where status is distinct from 'removed';
