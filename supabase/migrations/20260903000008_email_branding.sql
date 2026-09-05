-- Email logo override + seed the templates the desk already uses

create table if not exists public.email_settings (
  id text primary key,
  logo_data_url text,
  updated_at timestamptz not null default now()
);

insert into public.email_settings (id)
values ('default')
on conflict (id) do nothing;

alter table public.email_settings enable row level security;

drop policy if exists "staff read email settings" on public.email_settings;
create policy "staff read email settings"
on public.email_settings for select
to anon, authenticated
using (true);

drop policy if exists "staff write email settings" on public.email_settings;
create policy "staff write email settings"
on public.email_settings for all
to anon, authenticated
using (true)
with check (true);

insert into public.email_templates (id, name, subject, body)
values
  (
    'outbid',
    'Outbid Notifications',
    'You''ve been outbid on {{item_title}}',
    E'Hey {{customer_name}},\n\nAnother paddle just jumped {{item_title}}. Current high is {{winning_bid}}.\n\nJump back in before the clock hits zero.\n\nDealFinder Auctions'
  ),
  (
    'winning_invoice',
    'Winning Bidder Invoice & Pickup Instructions',
    'You won {{item_title}} — invoice enclosed',
    E'POW, {{customer_name}}!\n\nYou hammered {{item_title}} at {{winning_bid}}.\n\nPay / pickup details: {{payment_link}}\n\nBring photo ID matching your bidder card.\n\nDealFinder Auctions desk'
  ),
  (
    'payment_reminder',
    'Payment Reminder / Overdue Notice',
    'Payment reminder: {{item_title}}',
    E'{{customer_name}},\n\nInvoice for {{item_title}} ({{winning_bid}}) is waiting.\n\nSettle here: {{payment_link}}\n\nOverdue lots may be relisted.\n\nDealFinder Auctions'
  ),
  (
    'consignor_payout',
    'Consignor Weekly Payout Statement',
    'Weekly payout statement — DealFinder',
    E'{{customer_name}},\n\nThis week''s statement includes {{item_title}} at hammer {{winning_bid}}.\n\nPayout detail: {{payment_link}}\n\nDealFinder Auctions'
  ),
  (
    'welcome',
    'Welcome / Bidder Card',
    'You''re on the floor — DealFinder Auctions',
    E'Hey {{customer_name}},\n\nYour bidder card is live. Browse lots, drop a paddle, and keep an eye on the clock.\n\nIf we need a payment, we''ll send it here: {{payment_link}}\n\nDealFinder Auctions'
  ),
  (
    'password_reset',
    'Password Reset / Staff Alert',
    'Reset your DealFinder paddle password',
    E'{{customer_name}},\n\nStaff requested a password reset for this paddle.\n\nSet a new password: {{payment_link}}\n\nIf you did not ask for this, tell the desk.\n\nDealFinder Auctions'
  )
on conflict (id) do nothing;
