insert into storage.buckets (id, name, public)
values ('feedback-attachments', 'feedback-attachments', false)
on conflict (id) do nothing;

update storage.buckets
set file_size_limit = 10485760
where id = 'feedback-attachments';

drop policy if exists "feedback_attachments_bucket_insert_all" on storage.objects;
create policy "feedback_attachments_bucket_insert_all"
on storage.objects
for insert
with check (bucket_id = 'feedback-attachments');
