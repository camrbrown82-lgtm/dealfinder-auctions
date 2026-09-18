-- =============================================================================
-- DealFinder / password reset tokens — paste into the Supabase SQL editor
-- =============================================================================

create table if not exists public.password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  user_id uuid references auth.users (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists password_reset_tokens_email_idx
  on public.password_reset_tokens (email, created_at desc);

alter table public.password_reset_tokens enable row level security;

update public.email_templates
set
  name = 'Password Reset',
  subject = 'Reset your DealFinder paddle password',
  body = E'{{customer_name}},\n\nUse this link to set a new DealFinder paddle password. It expires in one hour.\n\n{{payment_link}}\n\nIf you did not ask for this, ignore the email — your password stays the same.\n\nDealFinder Auctions'
where id = 'password_reset'
  and body like '%Staff requested%';
