-- Consignor charity toggle. Staff see it on the approval queue.

alter table public.consignments
  add column if not exists is_charity boolean not null default false;
