-- Tie public consignments to the logged-in consignor so approval mail has a recipient
-- and the public form cannot list other consignors.

alter table public.consignments
  add column if not exists contact_email text;

alter table public.consignments
  add column if not exists owner_id uuid references auth.users (id) on delete set null;

create index if not exists consignments_owner_id_idx on public.consignments (owner_id);
create index if not exists consignments_contact_email_idx on public.consignments (contact_email);
