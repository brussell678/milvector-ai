-- Let the admin read feedback attachments so the admin portal can create signed
-- URLs and render images inline. Uploads are browser-direct to Storage (to dodge
-- Vercel's 4.5MB function payload cap); this policy covers the read side.
-- The service role (used server-side to embed attachments in email) bypasses RLS
-- and does not depend on this policy.

drop policy if exists "feedback_attachments_bucket_select_admin" on storage.objects;
create policy "feedback_attachments_bucket_select_admin"
on storage.objects
for select
using (
  bucket_id = 'feedback-attachments'
  and lower(coalesce(auth.jwt()->>'email', '')) = 'russell.innovation.group@gmail.com'
);
