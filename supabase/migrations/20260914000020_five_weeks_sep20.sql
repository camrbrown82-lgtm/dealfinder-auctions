-- Five weekly hammers from Sep 20. Live lots go on Sep 20.
-- Paste only this into the SQL editor.

alter table public.auction_events
  add column if not exists archived_at timestamptz;

insert into public.auction_events (name, auction_number, starts_at, ends_at)
select 'Weekly sale · Sep 20', 'AU-2026-0920', '2026-09-14 10:00:00-06', '2026-09-20 18:00:00-06'
where not exists (select 1 from public.auction_events where auction_number = 'AU-2026-0920');

insert into public.auction_events (name, auction_number, starts_at, ends_at)
select 'Weekly sale · Sep 27', 'AU-2026-0927', '2026-09-20 18:00:00-06', '2026-09-27 18:00:00-06'
where not exists (select 1 from public.auction_events where auction_number = 'AU-2026-0927');

insert into public.auction_events (name, auction_number, starts_at, ends_at)
select 'Weekly sale · Oct 4', 'AU-2026-1004', '2026-09-27 18:00:00-06', '2026-10-04 18:00:00-06'
where not exists (select 1 from public.auction_events where auction_number = 'AU-2026-1004');

insert into public.auction_events (name, auction_number, starts_at, ends_at)
select 'Weekly sale · Oct 11', 'AU-2026-1011', '2026-10-04 18:00:00-06', '2026-10-11 18:00:00-06'
where not exists (select 1 from public.auction_events where auction_number = 'AU-2026-1011');

insert into public.auction_events (name, auction_number, starts_at, ends_at)
select 'Weekly sale · Oct 18', 'AU-2026-1018', '2026-10-11 18:00:00-06', '2026-10-18 18:00:00-06'
where not exists (select 1 from public.auction_events where auction_number = 'AU-2026-1018');

update public.auction_events
set name = 'Weekly sale · Sep 20',
    starts_at = '2026-09-14 10:00:00-06',
    ends_at = '2026-09-20 18:00:00-06',
    archived_at = null
where auction_number = 'AU-2026-0920';

update public.auction_events
set name = 'Weekly sale · Sep 27',
    starts_at = '2026-09-20 18:00:00-06',
    ends_at = '2026-09-27 18:00:00-06',
    archived_at = null
where auction_number = 'AU-2026-0927';

update public.auction_events
set name = 'Weekly sale · Oct 4',
    starts_at = '2026-09-27 18:00:00-06',
    ends_at = '2026-10-04 18:00:00-06',
    archived_at = null
where auction_number = 'AU-2026-1004';

update public.auction_events
set name = 'Weekly sale · Oct 11',
    starts_at = '2026-10-04 18:00:00-06',
    ends_at = '2026-10-11 18:00:00-06',
    archived_at = null
where auction_number = 'AU-2026-1011';

update public.auction_events
set name = 'Weekly sale · Oct 18',
    starts_at = '2026-10-11 18:00:00-06',
    ends_at = '2026-10-18 18:00:00-06',
    archived_at = null
where auction_number = 'AU-2026-1018';

update public.auction_events
set
  name = 'Weekly sale · Sep 20',
  auction_number = 'AU-2026-0920',
  starts_at = '2026-09-14 10:00:00-06',
  ends_at = '2026-09-20 18:00:00-06',
  archived_at = null
where auction_number = 'AU-2026-001'
  and not exists (select 1 from public.auction_events e2 where e2.auction_number = 'AU-2026-0920');

-- Every unsold live lot goes on Sep 20 and ends Sep 20.
update public.lots
set
  event_id = (select id from public.auction_events where auction_number = 'AU-2026-0920' limit 1),
  ends_at = '2026-09-20 18:00:00-06',
  status = 'live'
where status is distinct from 'removed'
  and not (
    status = 'ended'
    and (coalesce(high_bidder, '') <> '' or high_bidder_id is not null)
  );

update public.auction_events
set archived_at = now()
where coalesce(auction_number, '') not in (
  'AU-2026-0920', 'AU-2026-0927', 'AU-2026-1004', 'AU-2026-1011', 'AU-2026-1018'
)
  and archived_at is null;
