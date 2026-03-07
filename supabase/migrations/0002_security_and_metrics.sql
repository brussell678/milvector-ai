-- PRD closure hardening pass:
-- 1) Enforce PDF-only storage at bucket/policy level
-- 2) Set explicit file size limits in storage config

-- Configure bucket constraints (10 MB max, PDFs only)
update storage.buckets
set
  file_size_limit = 10485760,
  allowed_mime_types = array['application/pdf']
where id = 'documents';

-- Tighten insert policy to PDF files only
drop policy if exists "documents_bucket_insert_own" on storage.objects;
create policy "documents_bucket_insert_own"
on storage.objects
for insert
with check (
  bucket_id = 'documents'
  and auth.uid()::text = split_part(name, '/', 1)
  and lower(storage.extension(name)) = 'pdf'
);

-- Tighten update policy to PDF files only
drop policy if exists "documents_bucket_update_own" on storage.objects;
create policy "documents_bucket_update_own"
on storage.objects
for update
using (
  bucket_id = 'documents'
  and auth.uid()::text = split_part(name, '/', 1)
)
with check (
  bucket_id = 'documents'
  and auth.uid()::text = split_part(name, '/', 1)
  and lower(storage.extension(name)) = 'pdf'
);

