-- Cash payment requests, invoice channel, and win-email stamp.

alter table public.settlement_invoices
  drop constraint if exists settlement_invoices_payment_check;

alter table public.settlement_invoices
  add constraint settlement_invoices_payment_check
  check (payment_status in ('unpaid', 'partial', 'paid', 'cash_pending'));

alter table public.settlement_invoices
  add column if not exists payment_channel text not null default 'helcim',
  add column if not exists win_email_sent_at timestamptz;

alter table public.lots
  add column if not exists shipping_cost numeric not null default 0;
