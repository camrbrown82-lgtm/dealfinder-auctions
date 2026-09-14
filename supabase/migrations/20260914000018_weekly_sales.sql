-- Pin weekly sales: Sep 20, Sep 27, Oct 4 (Airdrie MDT).
-- Paste into the Supabase SQL editor.

alter table public.auction_events
  add column if not exists archived_at timestamptz;

insert into public.auction_events (name, auction_number, starts_at, ends_at)
select 'Weekly sale · Sep 20', 'AU-2026-0920', '2026-09-20 10:00:00-06', '2026-09-27 09:59:00-06'
where not exists (
  select 1 from public.auction_events where auction_number = 'AU-2026-0920'
);

insert into public.auction_events (name, auction_number, starts_at, ends_at)
select 'Weekly sale · Sep 27', 'AU-2026-0927', '2026-09-27 10:00:00-06', '2026-10-04 09:59:00-06'
where not exists (
  select 1 from public.auction_events where auction_number = 'AU-2026-0927'
);

insert into public.auction_events (name, auction_number, starts_at, ends_at)
select 'Weekly sale · Oct 4', 'AU-2026-1004', '2026-10-04 10:00:00-06', '2026-10-11 09:59:00-06'
where not exists (
  select 1 from public.auction_events where auction_number = 'AU-2026-1004'
);

update public.auction_events
set
  name = 'Weekly sale · Sep 20',
  starts_at = '2026-09-20 10:00:00-06',
  ends_at = '2026-09-27 09:59:00-06',
  archived_at = null
where auction_number = 'AU-2026-0920';

update public.auction_events
set
  name = 'Weekly sale · Sep 27',
  starts_at = '2026-09-27 10:00:00-06',
  ends_at = '2026-10-04 09:59:00-06',
  archived_at = null
where auction_number = 'AU-2026-0927';

update public.auction_events
set
  name = 'Weekly sale · Oct 4',
  starts_at = '2026-10-04 10:00:00-06',
  ends_at = '2026-10-11 09:59:00-06',
  archived_at = null
where auction_number = 'AU-2026-1004';

update public.auction_events
set archived_at = now()
where coalesce(auction_number, '') not in ('AU-2026-0920', 'AU-2026-0927', 'AU-2026-1004')
  and archived_at is null;

update public.lots
set
  event_id = (
    select id from public.auction_events where auction_number = 'AU-2026-0920' limit 1
  ),
  ends_at = '2026-09-27 09:59:00-06',
  status = 'live'
where status not in ('ended', 'removed')
  and (
    event_id is null
    or event_id not in (
      select id from public.auction_events
      where auction_number in ('AU-2026-0920', 'AU-2026-0927', 'AU-2026-1004')
    )
  );
