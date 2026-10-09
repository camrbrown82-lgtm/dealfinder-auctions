-- Cached catalog text for a product. The same SKU is not sent to OpenAI again.

create table if not exists public.product_listings (
  id uuid primary key default gen_random_uuid(),
  sku text not null,
  raw_data jsonb not null default '{}'::jsonb,
  generated_listing jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists product_listings_sku_uidx
  on public.product_listings (sku);

alter table public.product_listings enable row level security;
