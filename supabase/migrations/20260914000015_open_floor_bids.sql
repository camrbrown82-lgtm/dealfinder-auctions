-- Allow floor bids on unsold lots even if the clock already passed or
-- status is paused/ended-without-a-winner. Sold lots stay closed.
-- Paste this into the Supabase SQL editor if the CLI cannot apply it.

create or replace function public.validate_and_apply_bid()
returns trigger
language plpgsql
as $$
declare
  lot public.lots%rowtype;
  new_ends timestamptz;
  sold boolean;
begin
  select * into lot from public.lots where id = new.lot_id for update;
  if not found then
    raise exception 'Lot not found';
  end if;

  if lot.status = 'removed' or lot.status = 'draft' then
    raise exception 'Lot is not open for bidding';
  end if;

  sold := lot.status = 'ended' and coalesce(lot.high_bidder, '') <> '';
  if sold then
    raise exception 'Lot is not open for bidding';
  end if;

  if lot.status is distinct from 'live' or lot.ends_at is null or lot.ends_at <= now() then
    new_ends := now() + interval '7 days';
    if lot.ends_at is not null and lot.ends_at > now() then
      new_ends := lot.ends_at;
    end if;
    update public.lots
    set status = 'live', ends_at = new_ends
    where id = new.lot_id;
    lot.status := 'live';
    lot.ends_at := new_ends;
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
    ends_at = new_ends,
    status = 'live'
  where id = new.lot_id;

  return new;
end;
$$;

update public.lots
set
  status = 'live',
  ends_at = now() + interval '7 days'
where status is distinct from 'removed'
  and status is distinct from 'draft'
  and not (status = 'ended' and coalesce(high_bidder, '') <> '');
