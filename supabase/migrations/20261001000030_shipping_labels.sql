-- Parcel size and Canada Post tracking on settlement invoices.

alter table public.settlement_invoices
  add column if not exists parcel_weight_kg numeric not null default 0,
  add column if not exists parcel_length_cm numeric not null default 0,
  add column if not exists parcel_width_cm numeric not null default 0,
  add column if not exists parcel_height_cm numeric not null default 0,
  add column if not exists tracking_number text not null default '';
