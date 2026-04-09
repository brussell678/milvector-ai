alter table public.message_board_posts
add column if not exists status text not null default 'active'
  check (status in ('active', 'hidden', 'removed')),
add column if not exists is_pinned boolean not null default false,
add column if not exists is_locked boolean not null default false,
add column if not exists last_activity_at timestamptz not null default now(),
add column if not exists edited_at timestamptz;

update public.message_board_posts
set last_activity_at = coalesce(
  (
    select max(child.created_at)
    from public.message_board_posts child
    where child.parent_post_id = message_board_posts.id
  ),
  created_at
)
where parent_post_id is null;

drop policy if exists "message_board_posts_update_own" on public.message_board_posts;
create policy "message_board_posts_update_own"
on public.message_board_posts
for update
using (
  auth.uid() = user_id
  or lower(coalesce(auth.jwt()->>'email', '')) = 'russell.innovation.group@gmail.com'
)
with check (
  auth.uid() = user_id
  or lower(coalesce(auth.jwt()->>'email', '')) = 'russell.innovation.group@gmail.com'
);

drop policy if exists "message_board_posts_delete_own" on public.message_board_posts;
create policy "message_board_posts_delete_own"
on public.message_board_posts
for delete
using (
  auth.uid() = user_id
  or lower(coalesce(auth.jwt()->>'email', '')) = 'russell.innovation.group@gmail.com'
);
