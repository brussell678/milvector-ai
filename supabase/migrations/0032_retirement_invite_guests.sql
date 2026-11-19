-- Retirement Invitation Builder, Phase B: guest RSVPs.
-- Additive only: one new table and five functions. Nothing existing changes.
--
-- Guests have no account. They never read or write the table directly:
--   submit_invite_rsvp  saves an answer for a published invitation and
--                       returns the private street addresses the guest is now
--                       entitled to (events they answered yes or maybe).
--   get_invite_rsvp     reopens one guest's own answer from their personal
--                       link (a long random token), so they can change it.
-- The invitation's owner reads and manages their own guests through the row
-- policies. The admin has no access to guest answers.
--
-- Retention: guest answers are deleted 180 days after the ceremony.
-- purge_expired_invite_guests() does it, and runs on every RSVP and every time
-- an owner opens their guest list.

create table if not exists public.retirement_invite_guests (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid not null references public.retirement_invites(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  email text check (email is null or (length(email) <= 120 and email = lower(email))),
  name text not null check (length(name) between 1 and 80),
  phone text check (phone is null or length(phone) <= 30),
  -- { "<event id>": { "status": "yes" | "maybe" | "no", "adults": n, "children": n } }
  answers jsonb not null default '{}'::jsonb,
  -- { "<meal choice>": count }
  meals jsonb not null default '{}'::jsonb,
  dietary text check (dietary is null or length(dietary) <= 300),
  dod_id text check (dod_id is null or dod_id in ('yes', 'no')),
  -- Full legal names for visitor passes, one per line. Never an SSN or birth date.
  pass_names text check (pass_names is null or length(pass_names) <= 600),
  message text check (message is null or length(message) <= 1500),
  -- The host's ticks: { "sent": bool, "formDone": bool, "inHand": bool }
  pipeline jsonb not null default '{}'::jsonb,
  -- The answer this one replaced, so the host can see what changed
  previous jsonb,
  source text not null default 'guest' check (source in ('guest', 'host')),
  -- The secret in the guest's personal link. Null for guests the host added.
  edit_token text,
  late boolean not null default false,
  changed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (invite_id, email)
);

create index if not exists retirement_invite_guests_invite_idx on public.retirement_invite_guests(invite_id, updated_at desc);
create unique index if not exists retirement_invite_guests_token_idx on public.retirement_invite_guests(edit_token) where edit_token is not null;

drop trigger if exists retirement_invite_guests_set_updated_at on public.retirement_invite_guests;
create trigger retirement_invite_guests_set_updated_at
before update on public.retirement_invite_guests
for each row execute procedure public.set_updated_at();

-- Runs as the caller, so it can tell a signed-in owner's write (anon or
-- authenticated) from the RSVP function's. The owner of a guest row is always
-- the invitation's owner, an invitation holds at most 500 guests, and only
-- the RSVP function sets the personal-link secret.
create or replace function public.retirement_invite_guests_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  from_client boolean := current_user in ('anon', 'authenticated');
begin
  if tg_op = 'INSERT' then
    select i.user_id into new.owner_id from public.retirement_invites i where i.id = new.invite_id;
    if new.owner_id is null then
      raise exception 'No such invitation.';
    end if;
    if (select count(*) from public.retirement_invite_guests g where g.invite_id = new.invite_id) >= 500 then
      raise exception 'An invitation can have up to 500 guests.';
    end if;
    if from_client then
      new.source := 'host';
      new.edit_token := null;
      new.previous := null;
    end if;
  elsif tg_op = 'UPDATE' then
    new.invite_id := old.invite_id;
    new.owner_id := old.owner_id;
    new.created_at := old.created_at;
    if from_client then
      new.source := old.source;
      new.edit_token := old.edit_token;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists retirement_invite_guests_guard_trigger on public.retirement_invite_guests;
create trigger retirement_invite_guests_guard_trigger
before insert or update on public.retirement_invite_guests
for each row execute procedure public.retirement_invite_guests_guard();

alter table public.retirement_invite_guests enable row level security;

drop policy if exists "retirement_invite_guests_owner_read" on public.retirement_invite_guests;
create policy "retirement_invite_guests_owner_read"
on public.retirement_invite_guests
for select
using (auth.uid() = owner_id);

drop policy if exists "retirement_invite_guests_owner_insert" on public.retirement_invite_guests;
create policy "retirement_invite_guests_owner_insert"
on public.retirement_invite_guests
for insert
with check (auth.uid() = owner_id);

drop policy if exists "retirement_invite_guests_owner_update" on public.retirement_invite_guests;
create policy "retirement_invite_guests_owner_update"
on public.retirement_invite_guests
for update
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

drop policy if exists "retirement_invite_guests_owner_delete" on public.retirement_invite_guests;
create policy "retirement_invite_guests_owner_delete"
on public.retirement_invite_guests
for delete
using (auth.uid() = owner_id);

-- ─── Helpers ─────────────────────────────────────────────────────────

-- The ceremony is the first event. Null when the date is missing or bad.
create or replace function public.invite_ceremony_date(p_data jsonb)
returns date
language plpgsql
immutable
as $$
begin
  return (p_data->'events'->0->>'date')::date;
exception when others then
  return null;
end;
$$;

-- Private street addresses for the events a guest answered yes or maybe.
create or replace function public.invite_released_addresses(p_invite_id uuid, p_answers jsonb)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_object_agg(e->>'id', i.private_data->'addresses'->>(e->>'id')), '{}'::jsonb)
  from public.retirement_invites i
  cross join lateral jsonb_array_elements(coalesce(i.data->'events', '[]'::jsonb)) e
  where i.id = p_invite_id
    and coalesce((e->>'addressPrivate')::boolean, false)
    and coalesce(p_answers->(e->>'id')->>'status', '') in ('yes', 'maybe')
    and i.private_data->'addresses'->>(e->>'id') is not null;
$$;

-- Deletes guest answers 180 days after the ceremony, for every invitation.
create or replace function public.purge_expired_invite_guests()
returns integer
language sql
security definer
set search_path = public
as $$
  with gone as (
    delete from public.retirement_invite_guests g
    using public.retirement_invites i
    where g.invite_id = i.id
      and public.invite_ceremony_date(i.data) is not null
      and public.invite_ceremony_date(i.data) + 180 < current_date
    returning 1
  )
  select count(*)::integer from gone;
$$;

-- ─── Guest functions ─────────────────────────────────────────────────

-- Saves a guest's answer. A guest is found by their personal link first, then
-- by email. Answering again with an email already on the list replaces that
-- answer, keeps the old one in `previous` for the host, and issues a new
-- personal link (the old link stops working), so typing someone else's email
-- never reveals what they had entered.
create or replace function public.submit_invite_rsvp(
  p_slug text,
  p_token text,
  p_name text,
  p_email text,
  p_phone text,
  p_answers jsonb,
  p_meals jsonb,
  p_dietary text,
  p_dod_id text,
  p_pass_names text,
  p_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.retirement_invites;
  v_guest public.retirement_invite_guests;
  v_email text := lower(trim(coalesce(p_email, '')));
  v_name text := left(trim(coalesce(p_name, '')), 80);
  v_answers jsonb := '{}'::jsonb;
  v_meals jsonb := '{}'::jsonb;
  v_event jsonb;
  v_answer jsonb;
  v_status text;
  v_adults integer;
  v_children integer;
  v_option text;
  v_count integer;
  v_token text;
  v_dod text := nullif(trim(coalesce(p_dod_id, '')), '');
  v_on_base boolean := false;
  v_deadline date;
  v_pass_deadline date;
  v_late boolean;
begin
  select * into v_invite from public.retirement_invites i
  where i.slug = lower(p_slug) and i.published and not i.suspended;
  if v_invite.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if coalesce((v_invite.data->'rsvp'->>'enabled')::boolean, true) = false then
    return jsonb_build_object('ok', false, 'reason', 'closed');
  end if;

  perform public.purge_expired_invite_guests();

  if length(v_name) < 2 or length(v_email) > 120 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  if (select count(*) from public.retirement_invite_guests g
      where g.invite_id = v_invite.id and g.updated_at > now() - interval '1 day') >= 300 then
    return jsonb_build_object('ok', false, 'reason', 'busy');
  end if;

  -- Keep only answers for this invitation's events, with sane counts.
  for v_event in select * from jsonb_array_elements(coalesce(v_invite.data->'events', '[]'::jsonb)) loop
    v_answer := p_answers->(v_event->>'id');
    continue when v_answer is null or jsonb_typeof(v_answer) <> 'object';
    v_status := v_answer->>'status';
    continue when v_status is null or v_status not in ('yes', 'maybe', 'no');
    if v_status = 'no' then
      v_adults := 0;
      v_children := 0;
    else
      v_adults := case when coalesce(v_answer->>'adults', '') ~ '^[0-9]{1,3}$' then least((v_answer->>'adults')::integer, 30) else 1 end;
      v_children := case when coalesce(v_answer->>'children', '') ~ '^[0-9]{1,3}$' then least((v_answer->>'children')::integer, 30) else 0 end;
      if coalesce((v_event->>'onBase')::boolean, false) then
        v_on_base := true;
      end if;
    end if;
    v_answers := v_answers || jsonb_build_object(v_event->>'id', jsonb_build_object('status', v_status, 'adults', v_adults, 'children', v_children));
  end loop;
  if v_answers = '{}'::jsonb then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  -- Meal counts: only the host's own choices, only while meals are on.
  if coalesce((v_invite.data->'rsvp'->'meals'->>'enabled')::boolean, false) and jsonb_typeof(p_meals) = 'object' then
    for v_option in select jsonb_array_elements_text(coalesce(v_invite.data->'rsvp'->'meals'->'options', '[]'::jsonb)) loop
      if coalesce(p_meals->>v_option, '') ~ '^[0-9]{1,3}$' then
        v_count := least((p_meals->>v_option)::integer, 30);
        if v_count > 0 then
          v_meals := v_meals || jsonb_build_object(v_option, v_count);
        end if;
      end if;
    end loop;
  end if;

  -- The DoD ID question only applies to a guest coming aboard an installation.
  if not v_on_base or v_dod not in ('yes', 'no') then
    v_dod := null;
  end if;

  -- Late: past the general RSVP date, or past the pass date for a pass guest.
  begin
    v_deadline := nullif(v_invite.data->'rsvp'->>'deadline', '')::date;
  exception when others then
    v_deadline := null;
  end;
  begin
    v_pass_deadline := nullif(v_invite.data->'base'->>'passDeadline', '')::date;
  exception when others then
    v_pass_deadline := null;
  end;
  v_late := coalesce(
    (v_deadline is not null and current_date > v_deadline)
    or (coalesce(v_dod, '') = 'no' and v_pass_deadline is not null and current_date > v_pass_deadline),
    false
  );

  -- Find the guest: personal link first, then email.
  if p_token is not null and length(p_token) >= 32 then
    select * into v_guest from public.retirement_invite_guests g
    where g.invite_id = v_invite.id and g.edit_token = p_token;
  end if;
  if v_guest.id is not null then
    v_token := v_guest.edit_token;
    -- Changing to an email another guest already uses would merge two people.
    if v_email <> coalesce(v_guest.email, '') and exists (
      select 1 from public.retirement_invite_guests g
      where g.invite_id = v_invite.id and g.email = v_email and g.id <> v_guest.id
    ) then
      v_email := v_guest.email;
    end if;
  else
    select * into v_guest from public.retirement_invite_guests g
    where g.invite_id = v_invite.id and g.email = v_email;
    v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  end if;

  if v_guest.id is null then
    if (select count(*) from public.retirement_invite_guests g where g.invite_id = v_invite.id) >= 500 then
      return jsonb_build_object('ok', false, 'reason', 'full');
    end if;
    insert into public.retirement_invite_guests
      (invite_id, owner_id, email, name, phone, answers, meals, dietary, dod_id, pass_names, message, source, edit_token, late)
    values (
      v_invite.id, v_invite.user_id, v_email, v_name,
      nullif(left(trim(coalesce(p_phone, '')), 30), ''),
      v_answers, v_meals,
      nullif(left(trim(coalesce(p_dietary, '')), 300), ''),
      v_dod,
      case when v_dod = 'no' then nullif(left(trim(coalesce(p_pass_names, '')), 600), '') end,
      nullif(left(trim(coalesce(p_message, '')), 1500), ''),
      'guest', v_token, v_late
    );
  else
    update public.retirement_invite_guests g set
      previous = jsonb_build_object(
        'name', g.name, 'email', g.email, 'answers', g.answers, 'meals', g.meals, 'dod_id', g.dod_id,
        'pass_names', g.pass_names, 'dietary', g.dietary, 'message', g.message, 'at', g.updated_at
      ),
      email = v_email,
      name = v_name,
      phone = nullif(left(trim(coalesce(p_phone, '')), 30), ''),
      answers = v_answers,
      meals = v_meals,
      dietary = nullif(left(trim(coalesce(p_dietary, '')), 300), ''),
      dod_id = v_dod,
      pass_names = case when v_dod = 'no' then nullif(left(trim(coalesce(p_pass_names, '')), 600), '') end,
      message = nullif(left(trim(coalesce(p_message, '')), 1500), ''),
      edit_token = v_token,
      late = v_late,
      changed_at = now()
    where g.id = v_guest.id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'token', v_token,
    'late', v_late,
    'addresses', public.invite_released_addresses(v_invite.id, v_answers)
  );
end;
$$;

-- One guest's own answer, by the secret in their personal link.
create or replace function public.get_invite_rsvp(p_slug text, p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_invite public.retirement_invites;
  v_guest public.retirement_invite_guests;
begin
  if p_token is null or length(p_token) < 32 then
    return null;
  end if;
  select * into v_invite from public.retirement_invites i
  where i.slug = lower(p_slug) and i.published and not i.suspended;
  if v_invite.id is null then
    return null;
  end if;
  select * into v_guest from public.retirement_invite_guests g
  where g.invite_id = v_invite.id and g.edit_token = p_token;
  if v_guest.id is null then
    return null;
  end if;
  return jsonb_build_object(
    'name', v_guest.name,
    'email', v_guest.email,
    'phone', v_guest.phone,
    'answers', v_guest.answers,
    'meals', v_guest.meals,
    'dietary', v_guest.dietary,
    'dodId', v_guest.dod_id,
    'passNames', v_guest.pass_names,
    'message', v_guest.message,
    'addresses', public.invite_released_addresses(v_invite.id, v_guest.answers)
  );
end;
$$;

revoke all on function public.invite_ceremony_date(jsonb) from public;
revoke all on function public.invite_released_addresses(uuid, jsonb) from public;
revoke all on function public.purge_expired_invite_guests() from public;
revoke all on function public.submit_invite_rsvp(text, text, text, text, text, jsonb, jsonb, text, text, text, text) from public;
revoke all on function public.get_invite_rsvp(text, text) from public;
grant execute on function public.purge_expired_invite_guests() to authenticated;
grant execute on function public.submit_invite_rsvp(text, text, text, text, text, jsonb, jsonb, text, text, text, text) to anon, authenticated;
grant execute on function public.get_invite_rsvp(text, text) to anon, authenticated;
