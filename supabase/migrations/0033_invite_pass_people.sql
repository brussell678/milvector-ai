-- Retirement Invitation Builder: one email per adult who needs a pass.
-- The base emails each adult their own link to enter their information, so a
-- pass guest now gives a full legal name AND an email address for every adult.
-- Children do not need a pass.
--
-- Additive and safe in either order with the code:
--   * pass_people is a new column with a default; nothing reads it until the
--     new code ships.
--   * The Phase B function signature (text p_pass_names) keeps working: it is
--     rewritten here as a thin wrapper around the new jsonb version.
--   * Names already saved from Phase B are copied into pass_people (with no
--     email, which the host's Guests tab flags).

alter table public.retirement_invite_guests
  add column if not exists pass_people jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'retirement_invite_guests_pass_people_check') then
    alter table public.retirement_invite_guests
      add constraint retirement_invite_guests_pass_people_check
      check (jsonb_typeof(pass_people) = 'array' and jsonb_array_length(pass_people) <= 30);
  end if;
end;
$$;

-- Carry over Phase B's one-name-per-line field.
update public.retirement_invite_guests g
set pass_people = coalesce((
  select jsonb_agg(jsonb_build_object('name', left(trim(line), 80), 'email', ''))
  from regexp_split_to_table(g.pass_names, E'\r?\n') as line
  where length(trim(line)) >= 2
), '[]'::jsonb)
where g.pass_names is not null and g.pass_people = '[]'::jsonb;

-- Cleans a guest-supplied list into [{ "name", "email" }]: names of 2 to 80
-- characters, emails lower-cased and well formed (or empty), at most 30.
create or replace function public.invite_clean_pass_people(p_people jsonb)
returns jsonb
language sql
immutable
as $$
  select coalesce(jsonb_agg(jsonb_build_object('name', x.n, 'email', x.e) order by x.ord), '[]'::jsonb)
  from (
    select left(trim(coalesce(p->>'name', '')), 80) as n,
           lower(left(trim(coalesce(p->>'email', '')), 120)) as e,
           ord
    from jsonb_array_elements(case when jsonb_typeof(p_people) = 'array' then p_people else '[]'::jsonb end) with ordinality as t(p, ord)
    where jsonb_typeof(p) = 'object'
    order by ord
    limit 30
  ) x
  where length(x.n) >= 2
    and (x.e = '' or x.e ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$');
$$;

-- The RSVP function, now taking each adult who needs a pass with their own
-- email. Everything else is unchanged from 0032: a guest is found by their
-- personal link first, then by email; answering again with an email already
-- on the list replaces that answer, keeps the old one in `previous`, and
-- issues a new personal link.
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
  p_pass_people jsonb,
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
  v_people jsonb := '[]'::jsonb;
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

  -- The DoD ID question only applies to a guest coming aboard an installation,
  -- and the adults needing a pass only to a guest who answered no.
  if not v_on_base or v_dod not in ('yes', 'no') then
    v_dod := null;
  end if;
  if v_dod = 'no' then
    v_people := public.invite_clean_pass_people(p_pass_people);
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
      (invite_id, owner_id, email, name, phone, answers, meals, dietary, dod_id, pass_names, pass_people, message, source, edit_token, late)
    values (
      v_invite.id, v_invite.user_id, v_email, v_name,
      nullif(left(trim(coalesce(p_phone, '')), 30), ''),
      v_answers, v_meals,
      nullif(left(trim(coalesce(p_dietary, '')), 300), ''),
      v_dod,
      null,
      v_people,
      nullif(left(trim(coalesce(p_message, '')), 1500), ''),
      'guest', v_token, v_late
    );
  else
    update public.retirement_invite_guests g set
      previous = jsonb_build_object(
        'name', g.name, 'email', g.email, 'answers', g.answers, 'meals', g.meals, 'dod_id', g.dod_id,
        'pass_people', g.pass_people, 'dietary', g.dietary, 'message', g.message, 'at', g.updated_at
      ),
      email = v_email,
      name = v_name,
      phone = nullif(left(trim(coalesce(p_phone, '')), 30), ''),
      answers = v_answers,
      meals = v_meals,
      dietary = nullif(left(trim(coalesce(p_dietary, '')), 300), ''),
      dod_id = v_dod,
      pass_names = null,
      pass_people = v_people,
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

-- The Phase B signature, kept so code that has not been updated yet still
-- works: names one per line, with no emails, passed to the version above.
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
language sql
security definer
set search_path = public
as $$
  select public.submit_invite_rsvp(
    p_slug, p_token, p_name, p_email, p_phone, p_answers, p_meals, p_dietary, p_dod_id,
    coalesce((
      select jsonb_agg(jsonb_build_object('name', trim(line), 'email', ''))
      from regexp_split_to_table(coalesce(p_pass_names, ''), E'\r?\n') as line
      where length(trim(line)) >= 2
    ), '[]'::jsonb),
    p_message
  );
$$;

-- One guest's own answer, by the secret in their personal link. Now also
-- returns the adults needing a pass.
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
    'passPeople', v_guest.pass_people,
    'message', v_guest.message,
    'addresses', public.invite_released_addresses(v_invite.id, v_guest.answers)
  );
end;
$$;

revoke all on function public.invite_clean_pass_people(jsonb) from public;
revoke all on function public.submit_invite_rsvp(text, text, text, text, text, jsonb, jsonb, text, text, jsonb, text) from public;
revoke all on function public.submit_invite_rsvp(text, text, text, text, text, jsonb, jsonb, text, text, text, text) from public;
grant execute on function public.submit_invite_rsvp(text, text, text, text, text, jsonb, jsonb, text, text, jsonb, text) to anon, authenticated;
grant execute on function public.submit_invite_rsvp(text, text, text, text, text, jsonb, jsonb, text, text, text, text) to anon, authenticated;
revoke all on function public.get_invite_rsvp(text, text) from public;
grant execute on function public.get_invite_rsvp(text, text) to anon, authenticated;
