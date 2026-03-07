-- Expand document types and storage format constraints.

alter table public.documents
drop constraint if exists documents_doc_type_check;

alter table public.documents
add constraint documents_doc_type_check
check (doc_type in ('FITREP', 'EVAL', 'VMET', 'JST', 'MASTER_RESUME', 'RESUME_TEMPLATE', 'OTHER'));

-- Allow multiple intake formats in storage bucket.
update storage.buckets
set
  file_size_limit = 10485760,
  allowed_mime_types = array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/markdown',
    'application/octet-stream'
  ]
where id = 'documents';

drop policy if exists "documents_bucket_insert_own" on storage.objects;
create policy "documents_bucket_insert_own"
on storage.objects
for insert
with check (
  bucket_id = 'documents'
  and auth.uid()::text = split_part(name, '/', 1)
  and lower(storage.extension(name)) in ('pdf', 'doc', 'docx', 'txt', 'md')
);

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
  and lower(storage.extension(name)) in ('pdf', 'doc', 'docx', 'txt', 'md')
);
