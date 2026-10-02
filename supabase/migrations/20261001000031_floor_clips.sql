-- Desk recordings that show on the public media page.

create table if not exists public.floor_clips (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  storage_path text not null,
  public_url text not null,
  created_at timestamptz not null default now()
);

alter table public.floor_clips enable row level security;

drop policy if exists "public read floor clips" on public.floor_clips;
create policy "public read floor clips"
on public.floor_clips for select
to public
using (true);

insert into storage.buckets (id, name, public, file_size_limit)
values ('floor-clips', 'floor-clips', true, 104857600)
on conflict (id) do update set public = true;

drop policy if exists "public read floor clips objects" on storage.objects;
create policy "public read floor clips objects"
on storage.objects for select
to public
using (bucket_id = 'floor-clips');
