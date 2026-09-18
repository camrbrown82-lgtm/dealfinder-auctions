-- =============================================================================
-- DealFinder test wipe — Vercel/Supabase sandbox (not dealfinder.com).
-- Desk admin stays: cookie df_admin + ADMIN_PASSWORD. Not stored in auth.users.
-- Removes ALL bidder profiles, lots, auctions, consignments, bids, invoices.
-- Does not drop schema, policies, triggers, email template rows, or env keys.
-- =============================================================================

begin;

truncate table
  public.bids,
  public.absentee_bids,
  public.auction_registrations,
  public.lots,
  public.consignments,
  public.auction_events,
  public.settlement_invoices,
  public.settlement_archives,
  public.helcim_sessions,
  public.helcim_transactions
restart identity cascade;

delete from public.profiles;

delete from auth.refresh_tokens;
delete from auth.sessions;
delete from auth.identities;
delete from auth.users;

update public.house_desk_settings
set next_lot_seq = 1, updated_at = now()
where id = 1;

commit;

-- select count(*) as lots from public.lots;
-- select count(*) as profiles from public.profiles;
-- select count(*) as auth_users from auth.users;
