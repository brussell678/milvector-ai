alter table public.tool_runs
drop constraint if exists tool_runs_tool_name_check;

alter table public.tool_runs
add constraint tool_runs_tool_name_check
check (tool_name in ('fitrep_bullets', 'mos_translator', 'jd_decoder', 'resume_targeter', 'linkedin_builder'));

create table if not exists public.linkedin_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  resume_text text not null,
  target_role text,
  industry text,
  location_pref text,
  generated_profile jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists linkedin_profiles_user_id_idx on public.linkedin_profiles(user_id, created_at desc);

alter table public.linkedin_profiles enable row level security;

drop policy if exists "linkedin_profiles_own_rows" on public.linkedin_profiles;
create policy "linkedin_profiles_own_rows"
on public.linkedin_profiles
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
