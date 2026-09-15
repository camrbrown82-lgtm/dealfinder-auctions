-- Listing condition shown on live lots (Used / New / Issues) plus staff notes for AI.

alter table public.lots
  add column if not exists listing_grade text;

alter table public.lots
  add column if not exists item_details text;

alter table public.consignments
  add column if not exists listing_grade text;

update public.lots
set listing_grade = 'Used'
where listing_grade is null or listing_grade = '';

update public.consignments
set listing_grade = case
  when condition in ('Used', 'New', 'Issues') then condition
  else 'Used'
end
where listing_grade is null or listing_grade = '';

alter table public.lots drop constraint if exists lots_listing_grade_check;
alter table public.lots
  add constraint lots_listing_grade_check
  check (listing_grade is null or listing_grade in ('Used', 'New', 'Issues'));

alter table public.consignments drop constraint if exists consignments_listing_grade_check;
alter table public.consignments
  add constraint consignments_listing_grade_check
  check (listing_grade is null or listing_grade in ('Used', 'New', 'Issues'));
