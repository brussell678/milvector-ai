-- MilVector AI Phase 2: timeline schema + transition tasks

alter table public.profiles
add column if not exists eas_date date;

update public.profiles
set eas_date = coalesce(eas_date, separation_date)
where separation_date is not null;

create table if not exists public.transition_tasks (
  id uuid primary key default gen_random_uuid(),
  phase_month int not null check (phase_month in (24, 18, 12, 9, 6, 3, 0)),
  title text not null,
  description text,
  tool_link text,
  knowledge_article text,
  created_at timestamptz not null default now()
);

create index if not exists transition_tasks_phase_idx on public.transition_tasks(phase_month, created_at desc);

create table if not exists public.transition_task_completions (
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null references public.transition_tasks(id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (user_id, task_id)
);

create index if not exists transition_task_completions_user_idx on public.transition_task_completions(user_id);

alter table public.transition_tasks enable row level security;
alter table public.transition_task_completions enable row level security;

drop policy if exists "transition_tasks_read_all" on public.transition_tasks;
create policy "transition_tasks_read_all"
on public.transition_tasks
for select
using (true);

drop policy if exists "transition_task_completions_own_rows" on public.transition_task_completions;
create policy "transition_task_completions_own_rows"
on public.transition_task_completions
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

insert into public.transition_tasks (phase_month, title, description, tool_link, knowledge_article)
values
  (24, 'Build transition plan', 'Map your mission objectives and target career tracks.', '/app/profile', '/knowledge-base'),
  (24, 'Start profile and EAS baseline', 'Set EAS date and initial goals to activate timeline planning.', '/app/profile', '/knowledge-base'),
  (18, 'Translate MOS to civilian language', 'Convert military experience to civilian role keywords.', '/app/tools/mos-translator', '/knowledge-base'),
  (18, 'Begin targeted networking', 'Identify mentors and hiring communities for your target roles.', '/knowledge-base', '/knowledge-base'),
  (12, 'Build master resume', 'Create your baseline resume from service records.', '/app/tools/fitrep-bullets', '/knowledge-base'),
  (12, 'Research SkillBridge pathways', 'Evaluate opportunities that align to your timeline.', '/knowledge-base', '/knowledge-base'),
  (9, 'Decode job descriptions', 'Analyze requirements and identify fit gaps before applying.', '/app/tools/jd-decoder', '/knowledge-base'),
  (6, 'Create targeted resumes', 'Generate role-specific versions of your resume.', '/app/tools/resume-targeter', '/knowledge-base'),
  (3, 'Execute application sprint', 'Run focused applications and interview prep cycles weekly.', '/app/tools/jd-decoder', '/knowledge-base'),
  (0, 'Finalize transition handoff', 'Complete civilian onboarding documents and first-90-day plan.', '/app/library', '/knowledge-base')
on conflict do nothing;