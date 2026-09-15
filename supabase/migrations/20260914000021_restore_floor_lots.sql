-- Move unsold warehouse / leftover lots onto Sep 20, and put approved consignments back in review if they never got a lot.
-- Paste only this. No filenames.

alter table public.auction_events
  add column if not exists archived_at timestamptz;

insert into public.auction_events (name, auction_number, starts_at, ends_at)
select 'Weekly sale · Sep 20', 'AU-2026-0920', '2026-09-14 10:00:00-06', '2026-09-20 18:00:00-06'
where not exists (select 1 from public.auction_events where auction_number = 'AU-2026-0920');

update public.auction_events
set name = 'Weekly sale · Sep 20',
    starts_at = '2026-09-14 10:00:00-06',
    ends_at = '2026-09-20 18:00:00-06',
    archived_at = null
where auction_number = 'AU-2026-0920';

update public.auction_events
set archived_at = now()
where auction_number in ('AU-2026-002', 'AU-2026-003')
   or (
     auction_number = 'AU-2026-001'
     and exists (select 1 from public.auction_events e2 where e2.auction_number = 'AU-2026-0920')
   );

update public.lots
set
  event_id = (select id from public.auction_events where auction_number = 'AU-2026-0920' limit 1),
  ends_at = '2026-09-20 18:00:00-06',
  status = 'live'
where status is distinct from 'removed'
  and not (
    status = 'ended'
    and (coalesce(high_bidder, '') <> '' or high_bidder_id is not null)
  )
  and (
    event_id is null
    or event_id not in (
      select id from public.auction_events
      where auction_number in ('AU-2026-0927', 'AU-2026-1004', 'AU-2026-1011', 'AU-2026-1018')
    )
  );

update public.consignments
set status = 'pending'
where status = 'approved'
  and id not in (
    select consignment_id from public.lots
    where consignment_id is not null
  );
