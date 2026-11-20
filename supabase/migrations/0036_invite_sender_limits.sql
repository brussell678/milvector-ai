-- Retirement Invitation Builder: answers and messages only through the site,
-- with a limit per sender.
--
-- Until now the guest page's two write functions could be called straight
-- from the internet with the public key. A script could send hundreds of
-- fake answers in seconds, use up the invitation's daily allowance, and lock
-- real guests out. After this migration:
--
--   * submit_invite_rsvp and submit_invite_message can no longer be called
--     with the public key. The site calls new versions with its server key,
--     after its own checks.
--   * each sender may send 30 answers a day, and 30 messages an hour, to one
--     invitation. A sender is a keyed scramble of their internet address and
--     the date, never the address itself, and these records are deleted
--     after two days.
--
-- BEFORE RUNNING: SUPABASE_SERVICE_ROLE_KEY must be set for Production in
-- Vercel (Settings, Environment Variables). The site needs it to reach the
-- new functions. Without it, RSVPs and messages stop working until it is set.
--
-- Additive except for the revokes at the end. Safe to run more than once.
-- To undo the lockdown only (keeping everything else), re-grant execute on
-- the two original functions to anon and authenticated.

create table if not exists public.retirement_invite_senders (
  id bigint generated always as identity primary key,
  invite_id uuid not null references public.retirement_invites(id) on delete cascade,
  sender text not null check (length(sender) between 16 and 128),
  kind text not null check (kind in ('rsvp', 'message')),
  created_at timestamptz not null default now()
);

create index if not exists retirement_invite_senders_lookup_idx on public.retirement_invite_senders(invite_id, sender, kind, created_at desc);
create index if not exists retirement_invite_senders_age_idx on public.retirement_invite_senders(created_at);

-- No policies: only the functions below read or write it.
alter table public.retirement_invite_senders enable row level security;

-- Records one attempt and says whether the sender is still under the limit.
-- An unknown address is let through; the submit function answers not_found.
create or replace function public.invite_sender_allowed(p_slug text, p_sender text, p_kind text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite uuid;
  v_window interval := case when p_kind = 'message' then interval '1 hour' else interval '1 day' end;
begin
  select i.id into v_invite from public.retirement_invites i where i.slug = lower(p_slug);
  if v_invite is null then
    return true;
  end if;
  delete from public.retirement_invite_senders s where s.created_at < now() - interval '2 days';
  if (select count(*) from public.retirement_invite_senders s
      where s.invite_id = v_invite and s.sender = p_sender and s.kind = p_kind and s.created_at > now() - v_window) >= 30 then
    return false;
  end if;
  insert into public.retirement_invite_senders (invite_id, sender, kind) values (v_invite, p_sender, p_kind);
  return true;
end;
$$;

-- The site's way in for an answer. Everything after the sender check is the
-- existing function, unchanged.
create or replace function public.submit_invite_rsvp_from_site(
  p_sender text,
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
begin
  if p_sender is null or length(p_sender) < 16 or length(p_sender) > 128 then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  if not public.invite_sender_allowed(p_slug, p_sender, 'rsvp') then
    return jsonb_build_object('ok', false, 'reason', 'slow');
  end if;
  return public.submit_invite_rsvp(p_slug, p_token, p_name, p_email, p_phone, p_answers, p_meals, p_dietary, p_dod_id, p_pass_people, p_message);
end;
$$;

-- The site's way in for a message left on the day or after.
create or replace function public.submit_invite_message_from_site(p_sender text, p_slug text, p_name text, p_message text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_sender is null or length(p_sender) < 16 or length(p_sender) > 128 then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  if not public.invite_sender_allowed(p_slug, p_sender, 'message') then
    return jsonb_build_object('ok', false, 'reason', 'slow');
  end if;
  return public.submit_invite_message(p_slug, p_name, p_message);
end;
$$;

-- Grants: the new functions for the server key only.
revoke all on function public.invite_sender_allowed(text, text, text) from public, anon, authenticated;
revoke all on function public.submit_invite_rsvp_from_site(text, text, text, text, text, text, jsonb, jsonb, text, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.submit_invite_message_from_site(text, text, text, text) from public, anon, authenticated;
grant execute on function public.submit_invite_rsvp_from_site(text, text, text, text, text, text, jsonb, jsonb, text, text, jsonb, text) to service_role;
grant execute on function public.submit_invite_message_from_site(text, text, text, text) to service_role;

-- The lockdown: the original functions no longer answer the public key.
-- Reopening a personal link (get_invite_rsvp) and reading a published page
-- are unchanged.
revoke execute on function public.submit_invite_rsvp(text, text, text, text, text, jsonb, jsonb, text, text, jsonb, text) from anon, authenticated;
revoke execute on function public.submit_invite_rsvp(text, text, text, text, text, jsonb, jsonb, text, text, text, text) from anon, authenticated;
revoke execute on function public.submit_invite_message(text, text, text) from anon, authenticated;
