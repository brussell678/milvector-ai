alter table public.feedback
add column if not exists admin_response text,
add column if not exists admin_response_updated_at timestamptz;

create index if not exists feedback_user_status_created_idx
  on public.feedback(user_id, status, created_at desc);
