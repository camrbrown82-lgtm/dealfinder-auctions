-- Terms template columns on auction_events. Paste after auction_registrations if needed.

alter table public.auction_events
  add column if not exists bidder_terms text,
  add column if not exists terms_and_conditions text,
  add column if not exists tc_template_type text not null default 'standard';

update public.auction_events
set terms_and_conditions = coalesce(nullif(trim(terms_and_conditions), ''), bidder_terms)
where terms_and_conditions is null
   or trim(terms_and_conditions) = '';

update public.auction_events
set tc_template_type = 'standard'
where tc_template_type is null
   or tc_template_type not in ('standard', 'high_bid', 'charity', 'custom');
