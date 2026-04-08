alter table public.linkedin_profiles
add column if not exists version_label text,
add column if not exists industry_tuning text,
add column if not exists analysis_context jsonb not null default '{}'::jsonb,
add column if not exists career_suggestions jsonb not null default '{}'::jsonb,
add column if not exists profile_score jsonb not null default '{}'::jsonb,
add column if not exists banner_output jsonb not null default '{}'::jsonb,
add column if not exists banner_image_path text,
add column if not exists updated_at timestamptz not null default now();

insert into storage.buckets (id, name, public)
values ('linkedin-banners', 'linkedin-banners', false)
on conflict (id) do nothing;

update storage.buckets
set file_size_limit = 10485760
where id = 'linkedin-banners';

drop policy if exists "linkedin_banners_insert_own" on storage.objects;
create policy "linkedin_banners_insert_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'linkedin-banners'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "linkedin_banners_select_own" on storage.objects;
create policy "linkedin_banners_select_own"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'linkedin-banners'
  and (storage.foldername(name))[1] = auth.uid()::text
);
