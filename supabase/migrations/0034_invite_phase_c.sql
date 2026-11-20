-- Retirement Invitation Builder, Phase C.
-- Additive only: two new tables, one new column, four new functions, and the
-- retention function extended to cover the new messages table.
--
--   retirement_invite_photos    up to 12 career photos per invitation, with
--                               captions. Guests see them only on a published
--                               page, through two lookup functions.
--   retirement_invite_messages  messages guests leave on the day and after,
--                               when the RSVP form has become a message form.
--                               Guests write through submit_invite_message.
--   retirement_invite_guests.last_reminded_at
--                               when the host last marked a reminder as sent
--                               to this guest (the host sends from their own
--                               email; MilVector sends nothing).

-- ─── Reminders ───────────────────────────────────────────────────────

alter table public.retirement_invite_guests
  add column if not exists last_reminded_at timestamptz;

-- ─── Career photos ───────────────────────────────────────────────────

create table if not exists public.retirement_invite_photos (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid not null references public.retirement_invites(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  position integer not null default 0,
  caption text not null default '' check (length(caption) <= 120),
  -- Shrunk in the browser to a JPEG before upload, sent as base64.
  jpeg text not null check (length(jpeg) <= 480000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists retirement_invite_photos_invite_idx on public.retirement_invite_photos(invite_id, position);

drop trigger if exists retirement_invite_photos_set_updated_at on public.retirement_invite_photos;
create trigger retirement_invite_photos_set_updated_at
before update on public.retirement_invite_photos
for each row execute procedure public.set_updated_at();

-- The owner is always the invitation's owner, and an invitation holds at most
-- 12 photos. Runs as the caller, so a member cannot add to someone else's.
create or replace function public.retirement_invite_photos_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    select i.user_id into new.owner_id from public.retirement_invites i where i.id = new.invite_id;
    if new.owner_id is null then
      raise exception 'No such invitation.';
    end if;
    if (select count(*) from public.retirement_invite_photos p where p.invite_id = new.invite_id) >= 12 then
      raise exception 'An invitation can have up to 12 photos.';
    end if;
  elsif tg_op = 'UPDATE' then
    new.invite_id := old.invite_id;
    new.owner_id := old.owner_id;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

drop trigger if exists retirement_invite_photos_guard_trigger on public.retirement_invite_photos;
create trigger retirement_invite_photos_guard_trigger
before insert or update on public.retirement_invite_photos
for each row execute procedure public.retirement_invite_photos_guard();

alter table public.retirement_invite_photos enable row level security;

drop policy if exists "retirement_invite_photos_own_rows" on public.retirement_invite_photos;
create policy "retirement_invite_photos_own_rows"
on public.retirement_invite_photos
for all
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

-- The photo list for a published invitation (no image data).
create or replace function public.get_public_invite_photos(p_slug text)
returns table (id uuid, "position" integer, caption text, updated_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.position, p.caption, p.updated_at
  from public.retirement_invite_photos p
  join public.retirement_invites i on i.id = p.invite_id
  where i.slug = lower(p_slug) and i.published and not i.suspended
  order by p.position, p.created_at;
$$;

-- One photo's image, for a published invitation.
create or replace function public.get_public_invite_photo(p_slug text, p_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.jpeg
  from public.retirement_invite_photos p
  join public.retirement_invites i on i.id = p.invite_id
  where i.slug = lower(p_slug) and i.published and not i.suspended and p.id = p_id
  limit 1;
$$;

-- ─── Messages left on the day and after ──────────────────────────────

create table if not exists public.retirement_invite_messages (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid not null references public.retirement_invites(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(name) between 1 and 80),
  message text not null check (length(message) between 1 and 1500),
  created_at timestamptz not null default now()
);

create index if not exists retirement_invite_messages_invite_idx on public.retirement_invite_messages(invite_id, created_at desc);

alter table public.retirement_invite_messages enable row level security;

-- The owner reads and removes messages; guests write only through the function.
drop policy if exists "retirement_invite_messages_owner_read" on public.retirement_invite_messages;
create policy "retirement_invite_messages_owner_read"
on public.retirement_invite_messages
for select
using (auth.uid() = owner_id);

drop policy if exists "retirement_invite_messages_owner_delete" on public.retirement_invite_messages;
create policy "retirement_invite_messages_owner_delete"
on public.retirement_invite_messages
for delete
using (auth.uid() = owner_id);

-- A guest leaves a message. Published pages only, while the host lets guests
-- leave messages, at most 200 a day per invitation.
create or replace function public.submit_invite_message(p_slug text, p_name text, p_message text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.retirement_invites;
  v_name text := left(trim(coalesce(p_name, '')), 80);
  v_message text := left(trim(coalesce(p_message, '')), 1500);
begin
  select * into v_invite from public.retirement_invites i
  where i.slug = lower(p_slug) and i.published and not i.suspended;
  if v_invite.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if coalesce((v_invite.data->'rsvp'->>'message')::boolean, true) = false then
    return jsonb_build_object('ok', false, 'reason', 'closed');
  end if;
  if length(v_name) < 2 or length(v_message) < 1 then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  if (select count(*) from public.retirement_invite_messages m
      where m.invite_id = v_invite.id and m.created_at > now() - interval '1 day') >= 200 then
    return jsonb_build_object('ok', false, 'reason', 'busy');
  end if;
  insert into public.retirement_invite_messages (invite_id, owner_id, name, message)
  values (v_invite.id, v_invite.user_id, v_name, v_message);
  return jsonb_build_object('ok', true);
end;
$$;

-- ─── Retention ───────────────────────────────────────────────────────

-- Guest answers and messages are deleted 180 days after the ceremony.
create or replace function public.purge_expired_invite_guests()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guests integer;
  v_messages integer;
begin
  with gone as (
    delete from public.retirement_invite_guests g
    using public.retirement_invites i
    where g.invite_id = i.id
      and public.invite_ceremony_date(i.data) is not null
      and public.invite_ceremony_date(i.data) + 180 < current_date
    returning 1
  )
  select count(*)::integer into v_guests from gone;

  with gone as (
    delete from public.retirement_invite_messages m
    using public.retirement_invites i
    where m.invite_id = i.id
      and public.invite_ceremony_date(i.data) is not null
      and public.invite_ceremony_date(i.data) + 180 < current_date
    returning 1
  )
  select count(*)::integer into v_messages from gone;

  return v_guests + v_messages;
end;
$$;

revoke all on function public.get_public_invite_photos(text) from public;
revoke all on function public.get_public_invite_photo(text, uuid) from public;
revoke all on function public.submit_invite_message(text, text, text) from public;
revoke all on function public.purge_expired_invite_guests() from public;
grant execute on function public.get_public_invite_photos(text) to anon, authenticated;
grant execute on function public.get_public_invite_photo(text, uuid) to anon, authenticated;
grant execute on function public.submit_invite_message(text, text, text) to anon, authenticated;
grant execute on function public.purge_expired_invite_guests() to authenticated;
