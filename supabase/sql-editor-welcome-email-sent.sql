-- Paste in the Supabase SQL editor.
-- Tracks that the welcome (non-payment) email already went out after email confirm.

alter table public.profiles
  add column if not exists welcome_email_sent_at timestamptz;
