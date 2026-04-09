create table if not exists public.message_board_blocked_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  blocked_by_user_id uuid references auth.users(id) on delete set null
);

create index if not exists message_board_blocked_users_created_idx
  on public.message_board_blocked_users(created_at desc);

alter table public.message_board_blocked_users enable row level security;

drop policy if exists "message_board_blocked_users_select_own_or_admin" on public.message_board_blocked_users;
create policy "message_board_blocked_users_select_own_or_admin"
on public.message_board_blocked_users
for select
using (
  auth.uid() = user_id
  or lower(coalesce(auth.jwt()->>'email', '')) = 'russell.innovation.group@gmail.com'
);

drop policy if exists "message_board_blocked_users_insert_admin" on public.message_board_blocked_users;
create policy "message_board_blocked_users_insert_admin"
on public.message_board_blocked_users
for insert
with check (lower(coalesce(auth.jwt()->>'email', '')) = 'russell.innovation.group@gmail.com');

drop policy if exists "message_board_blocked_users_delete_admin" on public.message_board_blocked_users;
create policy "message_board_blocked_users_delete_admin"
on public.message_board_blocked_users
for delete
using (lower(coalesce(auth.jwt()->>'email', '')) = 'russell.innovation.group@gmail.com');
