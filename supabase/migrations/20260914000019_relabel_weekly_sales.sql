-- Relabel the three existing sales in place. Do not paste filenames.
-- Hammer dates: Sep 20 (live now), Sep 27, Oct 4.

alter table public.auction_events
  add column if not exists archived_at timestamptz;

-- Week 1: Sep 20 hammer
update public.auction_events
set
  name = 'Weekly sale · Sep 20',
  auction_number = 'AU-2026-0920',
  starts_at = '2026-09-14 10:00:00-06',
  ends_at = '2026-09-20 18:00:00-06',
  archived_at = null
where auction_number = 'AU-2026-001'
  and not exists (
    select 1 from public.auction_events e2 where e2.auction_number = 'AU-2026-0920'
  );

update public.auction_events
set
  name = 'Weekly sale · Sep 20',
  starts_at = '2026-09-14 10:00:00-06',
  ends_at = '2026-09-20 18:00:00-06',
  archived_at = null
where auction_number = 'AU-2026-0920';

-- Week 2: Sep 27 hammer
update public.auction_events
set
  name = 'Weekly sale · Sep 27',
  auction_number = 'AU-2026-0927',
  starts_at = '2026-09-20 18:00:00-06',
  ends_at = '2026-09-27 18:00:00-06',
  archived_at = null
where auction_number = 'AU-2026-002'
  and not exists (
    select 1 from public.auction_events e2 where e2.auction_number = 'AU-2026-0927'
  );

update public.auction_events
set
  name = 'Weekly sale · Sep 27',
  starts_at = '2026-09-20 18:00:00-06',
  ends_at = '2026-09-27 18:00:00-06',
  archived_at = null
where auction_number = 'AU-2026-0927';

-- Week 3: Oct 4 hammer
update public.auction_events
set
  name = 'Weekly sale · Oct 4',
  auction_number = 'AU-2026-1004',
  starts_at = '2026-09-27 18:00:00-06',
  ends_at = '2026-10-04 18:00:00-06',
  archived_at = null
where auction_number = 'AU-2026-003'
  and not exists (
    select 1 from public.auction_events e2 where e2.auction_number = 'AU-2026-1004'
  );

update public.auction_events
set
  name = 'Weekly sale · Oct 4',
  starts_at = '2026-09-27 18:00:00-06',
  ends_at = '2026-10-04 18:00:00-06',
  archived_at = null
where auction_number = 'AU-2026-1004';

-- If both old and new week-1 rows exist, keep lots on Sep 20 and archive the leftover.
update public.lots
set event_id = (
  select id from public.auction_events where auction_number = 'AU-2026-0920' limit 1
)
where event_id in (
  select id from public.auction_events where auction_number = 'AU-2026-001'
);

update public.auction_events
set archived_at = now()
where auction_number in ('AU-2026-001', 'AU-2026-002', 'AU-2026-003');

-- Clocks follow the sale hammer. Unsold lots stay bidable.
update public.lots l
set
  ends_at = e.ends_at,
  status = 'live'
from public.auction_events e
where l.event_id = e.id
  and e.auction_number in ('AU-2026-0920', 'AU-2026-0927', 'AU-2026-1004')
  and l.status is distinct from 'removed'
  and not (
    l.status = 'ended'
    and (
      coalesce(l.high_bidder, '') <> ''
      or l.high_bidder_id is not null
    )
  );
