alter table public.message_board_posts
add column if not exists linked_tool_slug text,
add column if not exists linked_resource_type text,
add column if not exists linked_resource_path text,
add column if not exists linked_resource_label text;

create table if not exists public.message_board_reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.message_board_posts(id) on delete cascade,
  reported_by_user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null,
  details text,
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed', 'actioned')),
  moderator_notes text,
  reviewed_at timestamptz,
  reviewed_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint message_board_reports_reason_check check (length(btrim(reason)) > 0)
);

create unique index if not exists message_board_reports_post_user_uidx
  on public.message_board_reports(post_id, reported_by_user_id);

create index if not exists message_board_reports_status_created_idx
  on public.message_board_reports(status, created_at desc);

create table if not exists public.message_board_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid not null references public.message_board_posts(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete cascade,
  notification_type text not null check (notification_type in ('thread_reply', 'followed_thread_reply')),
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists message_board_notifications_user_created_idx
  on public.message_board_notifications(user_id, created_at desc);

alter table public.message_board_reports enable row level security;
alter table public.message_board_notifications enable row level security;

drop policy if exists "message_board_reports_select_own_or_admin" on public.message_board_reports;
create policy "message_board_reports_select_own_or_admin"
on public.message_board_reports
for select
using (
  auth.uid() = reported_by_user_id
  or lower(coalesce(auth.jwt()->>'email', '')) = 'russell.innovation.group@gmail.com'
);

drop policy if exists "message_board_reports_insert_own" on public.message_board_reports;
create policy "message_board_reports_insert_own"
on public.message_board_reports
for insert
with check (auth.uid() = reported_by_user_id);

drop policy if exists "message_board_reports_update_admin" on public.message_board_reports;
create policy "message_board_reports_update_admin"
on public.message_board_reports
for update
using (lower(coalesce(auth.jwt()->>'email', '')) = 'russell.innovation.group@gmail.com')
with check (lower(coalesce(auth.jwt()->>'email', '')) = 'russell.innovation.group@gmail.com');

drop policy if exists "message_board_notifications_select_own" on public.message_board_notifications;
create policy "message_board_notifications_select_own"
on public.message_board_notifications
for select
using (auth.uid() = user_id);

drop policy if exists "message_board_notifications_update_own" on public.message_board_notifications;
create policy "message_board_notifications_update_own"
on public.message_board_notifications
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create or replace function public.create_message_board_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent_thread public.message_board_posts%rowtype;
begin
  if new.parent_post_id is null then
    return new;
  end if;

  select *
  into parent_thread
  from public.message_board_posts
  where id = new.parent_post_id;

  if not found then
    return new;
  end if;

  if parent_thread.user_id <> new.user_id then
    insert into public.message_board_notifications (user_id, post_id, actor_user_id, notification_type, message)
    values (
      parent_thread.user_id,
      new.parent_post_id,
      new.user_id,
      'thread_reply',
      'Someone replied to your thread: ' || coalesce(parent_thread.title, 'Untitled thread')
    );
  end if;

  insert into public.message_board_notifications (user_id, post_id, actor_user_id, notification_type, message)
  select distinct
    participant.user_id,
    new.parent_post_id,
    new.user_id,
    'followed_thread_reply',
    'New activity in a thread you joined: ' || coalesce(parent_thread.title, 'Untitled thread')
  from public.message_board_posts participant
  where participant.parent_post_id = new.parent_post_id
    and participant.user_id <> new.user_id
    and participant.user_id <> parent_thread.user_id
    and not exists (
      select 1
      from public.message_board_notifications existing
      where existing.user_id = participant.user_id
        and existing.post_id = new.parent_post_id
        and existing.actor_user_id = new.user_id
        and existing.notification_type = 'followed_thread_reply'
        and existing.created_at > now() - interval '2 minutes'
    );

  return new;
end;
$$;

drop trigger if exists create_message_board_notifications on public.message_board_posts;
create trigger create_message_board_notifications
after insert on public.message_board_posts
for each row
execute function public.create_message_board_notifications();
