-- Account deletion (2026-11-22). Run after 0039. Safe to run more than once.
--
-- A member can delete their account from their Profile. The server removes
-- their stored files, calls prepare_account_deletion below, then deletes the
-- sign-in record, and "on delete cascade" removes everything else they own.
--
-- Community: their replies and the threads nobody else answered are deleted.
-- A thread other members replied to stays, shown as from a former member, so
-- those replies survive. Support tickets: deleted.

-- 1. A Community post can outlive its author.
alter table public.message_board_posts alter column user_id drop not null;
alter table public.message_board_posts drop constraint if exists message_board_posts_user_id_fkey;
alter table public.message_board_posts
  add constraint message_board_posts_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

-- 2. Reply notifications, as in 0021 but comparing authors null-safely, so the
-- people in a thread whose author has left still hear about new replies.
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

  if parent_thread.user_id is not null and parent_thread.user_id is distinct from new.user_id then
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
    and participant.user_id is not null
    and participant.user_id is distinct from new.user_id
    and participant.user_id is distinct from parent_thread.user_id
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

-- 3. The cleanup run just before the sign-in record is deleted. Server only.
create or replace function public.prepare_account_deletion(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Their replies.
  delete from public.message_board_posts
  where user_id = p_user_id and parent_post_id is not null;

  -- Their threads nobody else replied to.
  delete from public.message_board_posts thread
  where thread.user_id = p_user_id
    and thread.parent_post_id is null
    and not exists (
      select 1 from public.message_board_posts reply
      where reply.parent_post_id = thread.id and reply.user_id is distinct from p_user_id
    );

  -- The threads that stay stop carrying their name. The author link itself
  -- is cleared when the sign-in record goes (on delete set null above).
  update public.message_board_posts
  set author_label = 'Former member'
  where user_id = p_user_id;

  -- Their support tickets. Attachments are removed from storage by the server first.
  delete from public.feedback where user_id = p_user_id;
end;
$$;

revoke all on function public.prepare_account_deletion(uuid) from public, anon, authenticated;
grant execute on function public.prepare_account_deletion(uuid) to service_role;
