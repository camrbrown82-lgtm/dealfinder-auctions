-- Sunday $50 pre-authorization agreement. Bidders check a box once; the hold
-- itself runs on auction-end day, not at bid time.
alter table public.profiles
  add column if not exists preauth_terms_agreed_at timestamptz;
