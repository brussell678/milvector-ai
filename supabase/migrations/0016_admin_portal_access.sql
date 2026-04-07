drop policy if exists "feedback_select_admin" on public.feedback;
create policy "feedback_select_admin"
on public.feedback
for select
using (lower(coalesce(auth.jwt()->>'email', '')) = 'russell.innovation.group@gmail.com');

drop policy if exists "feedback_update_admin" on public.feedback;
create policy "feedback_update_admin"
on public.feedback
for update
using (lower(coalesce(auth.jwt()->>'email', '')) = 'russell.innovation.group@gmail.com')
with check (lower(coalesce(auth.jwt()->>'email', '')) = 'russell.innovation.group@gmail.com');

drop policy if exists "library_submissions_select_admin" on public.library_submissions;
create policy "library_submissions_select_admin"
on public.library_submissions
for select
using (lower(coalesce(auth.jwt()->>'email', '')) = 'russell.innovation.group@gmail.com');

drop policy if exists "library_submissions_update_admin" on public.library_submissions;
create policy "library_submissions_update_admin"
on public.library_submissions
for update
using (lower(coalesce(auth.jwt()->>'email', '')) = 'russell.innovation.group@gmail.com')
with check (lower(coalesce(auth.jwt()->>'email', '')) = 'russell.innovation.group@gmail.com');

drop policy if exists "library_documents_insert_admin" on public.library_documents;
create policy "library_documents_insert_admin"
on public.library_documents
for insert
with check (lower(coalesce(auth.jwt()->>'email', '')) = 'russell.innovation.group@gmail.com');

drop policy if exists "library_submissions_bucket_read_admin" on storage.objects;
create policy "library_submissions_bucket_read_admin"
on storage.objects
for select
using (
  bucket_id = 'library-submissions'
  and lower(coalesce(auth.jwt()->>'email', '')) = 'russell.innovation.group@gmail.com'
);

drop policy if exists "feedback_attachments_bucket_read_admin" on storage.objects;
create policy "feedback_attachments_bucket_read_admin"
on storage.objects
for select
using (
  bucket_id = 'feedback-attachments'
  and lower(coalesce(auth.jwt()->>'email', '')) = 'russell.innovation.group@gmail.com'
);

drop policy if exists "library_submissions_bucket_read_approved_docs" on storage.objects;
create policy "library_submissions_bucket_read_approved_docs"
on storage.objects
for select
using (
  bucket_id = 'library-submissions'
  and exists (
    select 1
    from public.library_documents docs
    where docs.approved = true
      and docs.file_url = storage.objects.name
  )
);
