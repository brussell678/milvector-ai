-- Retirement Invitation Builder, Phase A.
-- Additive only: one new table and two functions. Nothing existing changes.
--
-- Design (same as the business cards in 0029): an invitation is private to its
-- owner. The guest page never reads the table directly. It goes through
-- get_public_invite(slug), which returns one published invitation by exact
-- address, so nobody can list or scrape invitations with the public API key.
--
-- Street addresses the owner marks "share only after RSVP" live in
-- private_data, which no public function returns. Phase B adds the RSVP
-- function that releases them to guests who answer yes.

create table if not exists public.retirement_invites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  data jsonb not null default '{}'::jsonb,
  private_data jsonb not null default '{}'::jsonb,
  cover_jpeg text check (cover_jpeg is null or length(cover_jpeg) <= 480000),
  published boolean not null default false,
  -- Set by the admin to take a page down. The owner cannot clear it.
  suspended boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists retirement_invites_user_id_idx on public.retirement_invites(user_id);

drop trigger if exists retirement_invites_set_updated_at on public.retirement_invites;
create trigger retirement_invites_set_updated_at
before update on public.retirement_invites
for each row execute procedure public.set_updated_at();

-- Guard rails the row policies cannot express: one invitation per member, and
-- only the admin (or the service role) may change the suspended flag.
create or replace function public.retirement_invites_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_admin boolean := lower(coalesce(auth.jwt()->>'email', '')) = 'russell.innovation.group@gmail.com'
                      or coalesce(auth.role(), '') = 'service_role';
begin
  if tg_op = 'INSERT' then
    if not is_admin then
      new.suspended := false;
    end if;
    if (select count(*) from public.retirement_invites where user_id = new.user_id) >= 1 then
      raise exception 'A member can have one retirement invitation.';
    end if;
  elsif tg_op = 'UPDATE' then
    if new.suspended is distinct from old.suspended and not is_admin then
      new.suspended := old.suspended;
    end if;
    new.user_id := old.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists retirement_invites_guard_trigger on public.retirement_invites;
create trigger retirement_invites_guard_trigger
before insert or update on public.retirement_invites
for each row execute procedure public.retirement_invites_guard();

alter table public.retirement_invites enable row level security;

drop policy if exists "retirement_invites_own_rows" on public.retirement_invites;
create policy "retirement_invites_own_rows"
on public.retirement_invites
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- The admin can read every invitation and update it (to suspend one that was reported).
drop policy if exists "retirement_invites_admin_read" on public.retirement_invites;
create policy "retirement_invites_admin_read"
on public.retirement_invites
for select
using (lower(coalesce(auth.jwt()->>'email', '')) = 'russell.innovation.group@gmail.com');

drop policy if exists "retirement_invites_admin_update" on public.retirement_invites;
create policy "retirement_invites_admin_update"
on public.retirement_invites
for update
using (lower(coalesce(auth.jwt()->>'email', '')) = 'russell.innovation.group@gmail.com')
with check (lower(coalesce(auth.jwt()->>'email', '')) = 'russell.innovation.group@gmail.com');

-- ─── Public functions ────────────────────────────────────────────────

-- One published invitation by exact address. Never returns private_data.
create or replace function public.get_public_invite(p_slug text)
returns table (id uuid, slug text, data jsonb, has_cover boolean, updated_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select i.id, i.slug, i.data, (i.cover_jpeg is not null), i.updated_at
  from public.retirement_invites i
  where i.slug = lower(p_slug) and i.published and not i.suspended
  limit 1;
$$;

create or replace function public.get_public_invite_cover(p_slug text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select i.cover_jpeg
  from public.retirement_invites i
  where i.slug = lower(p_slug) and i.published and not i.suspended
  limit 1;
$$;

revoke all on function public.get_public_invite(text) from public;
revoke all on function public.get_public_invite_cover(text) from public;
grant execute on function public.get_public_invite(text) to anon, authenticated;
grant execute on function public.get_public_invite_cover(text) to anon, authenticated;
