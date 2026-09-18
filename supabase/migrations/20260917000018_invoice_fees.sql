-- Buyer invoice fees: 15% premium, 5% GST, $10 shipping handling, carrier shipping.

alter table public.lots
  add column if not exists shipping_cost numeric not null default 0;

alter table public.settlement_invoices
  add column if not exists hammer numeric not null default 0,
  add column if not exists buyers_premium numeric not null default 0,
  add column if not exists gst numeric not null default 0,
  add column if not exists handling_fee numeric not null default 0,
  add column if not exists shipping_cost numeric not null default 0;
