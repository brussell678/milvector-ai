-- The admin's member roster and the retention timeline (Brandon's calls,
-- 2026-11-24). MilVector is used around retirement and rarely after, so a
-- member's transition records are cleared after about 14 months without use,
-- with email notice 60 days and 2 weeks before, and never earlier than 6
-- months after the retirement date in their profile. The account, business
-- cards, and Community posts stay. At first the admin approves each clear.
--
-- 1. When a member last used MilVector. Supabase's last_sign_in_at only moves
--    on a fresh sign-in, and a phone can stay signed in for months, so the app
--    records use itself: touch_last_seen() on page loads, at most twice a day.
-- 2. When their records were last cleared.
-- 3. retention_notices: every email about clearing, so none goes twice and
--    there is a record that the member was told.
-- 4. member_admin_actions: each clear or account deletion the admin made. It
--    has no foreign key, so a deletion's record outlives the account; it holds
--    the member id and counts, not their name or email.
-- 5. admin_member_roster(): one row per member for the roster. Service role
--    only (the admin portal's server code), never members.

alter table public.profiles add column if not exists last_seen_at timestamptz;
alter table public.profiles add column if not exists records_cleared_at timestamptz;

create or replace function public.touch_last_seen()
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles
  set last_seen_at = now()
  where id = auth.uid()
    and (last_seen_at is null or last_seen_at < now() - interval '12 hours');
$$;

revoke all on function public.touch_last_seen() from public, anon;
grant execute on function public.touch_last_seen() to authenticated;

create table if not exists public.retention_notices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('notice', 'final', 'cleared')),
  clear_on date not null,
  sent_at timestamptz not null default now(),
  unique (user_id, kind, clear_on)
);

alter table public.retention_notices enable row level security;
-- No policies: only the service role (the daily job and the admin portal) uses it.

create table if not exists public.member_admin_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  action text not null check (action in ('clear_records', 'delete_account')),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.member_admin_actions enable row level security;
-- No policies: service role only.

create or replace function public.admin_member_roster()
returns table (
  user_id uuid,
  email text,
  joined_at timestamptz,
  last_sign_in_at timestamptz,
  full_name text,
  branch text,
  rank text,
  retirement_date date,
  last_seen_at timestamptz,
  records_cleared_at timestamptz,
  documents integer,
  file_bytes bigint,
  resumes integer,
  linkedin integer,
  invites integer,
  timeline_done integer,
  tool_runs integer,
  last_tool_run timestamptz,
  cards integer,
  live_cards integer,
  data_bytes bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    u.id,
    u.email::text,
    u.created_at,
    u.last_sign_in_at,
    p.full_name,
    p.branch,
    p.rank,
    coalesce(p.eas_date, p.separation_date),
    p.last_seen_at,
    p.records_cleared_at,
    (select count(*)::int from public.documents d where d.user_id = u.id),
    (select coalesce(sum(d.size_bytes), 0)::bigint from public.documents d where d.user_id = u.id),
    (select count(*)::int from public.resume_artifacts r where r.user_id = u.id),
    (select count(*)::int from public.linkedin_profiles l where l.user_id = u.id),
    (select count(*)::int from public.retirement_invites i where i.user_id = u.id),
    (select count(*)::int from public.transition_task_completions c where c.user_id = u.id),
    (select count(*)::int from public.tool_runs t where t.user_id = u.id),
    (select max(t.created_at) from public.tool_runs t where t.user_id = u.id),
    (select count(*)::int from public.business_cards b where b.user_id = u.id),
    (select count(*)::int from public.business_cards b where b.user_id = u.id and b.published and not b.suspended),
    (
      coalesce((select sum(coalesce(octet_length(d.extracted_text), 0)) from public.documents d where d.user_id = u.id), 0)
      + coalesce((select sum(octet_length(r.content) + coalesce(octet_length(r.structured_output::text), 0)) from public.resume_artifacts r where r.user_id = u.id), 0)
      + coalesce((select sum(coalesce(octet_length(t.input_json::text), 0) + coalesce(octet_length(t.output_json::text), 0)) from public.tool_runs t where t.user_id = u.id), 0)
      + coalesce((select sum(coalesce(length(b.photo_jpeg), 0) + coalesce(length(b.photo_png), 0) + coalesce(length(b.banner_jpeg), 0) + coalesce(length(b.resume_data), 0)) from public.business_cards b where b.user_id = u.id), 0)
      + coalesce((select sum(length(ph.jpeg)) from public.retirement_invite_photos ph where ph.owner_id = u.id), 0)
    )::bigint
  from auth.users u
  left join public.profiles p on p.id = u.id;
$$;

revoke all on function public.admin_member_roster() from public, anon, authenticated;
grant execute on function public.admin_member_roster() to service_role;
