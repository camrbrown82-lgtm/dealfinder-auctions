-- Public bucket for consignor / admin item photos

insert into storage.buckets (id, name, public)
values ('consignment-images', 'consignment-images', true)
on conflict (id) do update set public = true;

drop policy if exists "public read consignment images" on storage.objects;
create policy "public read consignment images"
on storage.objects for select
to public
using (bucket_id = 'consignment-images');

drop policy if exists "authenticated upload consignment images" on storage.objects;
create policy "authenticated upload consignment images"
on storage.objects for insert
to authenticated, anon
with check (bucket_id = 'consignment-images');
