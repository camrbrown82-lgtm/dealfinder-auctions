-- Winner chooses ship or pickup after the hammer.
-- Paste into the Supabase SQL editor.

alter table public.lots
  add column if not exists fulfillment text not null default 'unset';

alter table public.lots drop constraint if exists lots_fulfillment_check;
alter table public.lots
  add constraint lots_fulfillment_check
  check (fulfillment in ('unset', 'ship', 'pickup'));

alter table public.settlement_invoices
  add column if not exists fulfillment text not null default 'unset';

alter table public.settlement_invoices drop constraint if exists settlement_invoices_fulfillment_check;
alter table public.settlement_invoices
  add constraint settlement_invoices_fulfillment_check
  check (fulfillment in ('unset', 'ship', 'pickup'));
