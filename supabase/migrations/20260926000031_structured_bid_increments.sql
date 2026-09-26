-- Structured live increments: $1 to $50, $2 from $51–$99, $5 from $100 up.

create or replace function public.bid_increment(current numeric)
returns numeric
language sql
immutable
as $$
  select case
    when coalesce(current, 0) <= 50 then 1::numeric
    when current < 100 then 2::numeric
    else 5::numeric
  end;
$$;

create or replace function public.validate_and_apply_bid()
returns trigger
language plpgsql
as $$
declare
  lot public.lots%rowtype;
  new_ends timestamptz;
  min_amount numeric;
  has_high boolean;
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

  has_high := coalesce(lot.high_bidder, '') <> '' or lot.high_bidder_id is not null;
  if has_high then
    min_amount := lot.current_bid + public.bid_increment(lot.current_bid);
  else
    min_amount := case
      when coalesce(lot.current_bid, 0) > 0 then lot.current_bid
      else public.bid_increment(0)
    end;
  end if;

  if new.amount is not null and new.amount < min_amount then
    raise exception 'Bid must be at least %', min_amount;
  end if;

  update public.lots
  set
    current_bid = new.amount,
    high_bidder = new.bidder_name,
    ends_at = new_ends,
    status = 'live',
    min_increment = public.bid_increment(new.amount)
  where id = new.lot_id;

  return new;
end;
$$;

drop trigger if exists bids_apply on public.bids;
create trigger bids_apply
before insert on public.bids
for each row execute procedure public.validate_and_apply_bid();

update public.lots
set min_increment = public.bid_increment(current_bid)
where min_increment is distinct from public.bid_increment(current_bid);
