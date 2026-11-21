-- The Targeted Resume Builder's review step.
--
-- Before a member downloads a targeted resume, they check every line with a
-- figure and every line that uses wording their master does not. When a line
-- is wrong, they say which kind of wrong:
--
--   outdated:  their master resume is out of date. Their corrected line is
--              kept here and applied to every later build until the master
--              they upload says the same thing, and it is listed so they can
--              copy it into their Word master.
--   misstated: the tailored line says something their master does not. Their
--              master's own line goes back in, and the report is kept so the
--              admin can watch how often the engine drifts.
--
-- Additive only: one new table, own rows for members, read access for the
-- admin. Safe to run more than once. Until it is run, a fix still corrects
-- the resume in hand; it is just not remembered.

create table if not exists public.master_corrections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('outdated', 'misstated')),
  -- The master's line as it was.
  old_line text not null check (length(old_line) between 1 and 2000),
  -- The member's corrected line (outdated only).
  new_line text check (new_line is null or length(new_line) between 1 and 2000),
  -- The tailored line the member rejected.
  resume_line text check (resume_line is null or length(resume_line) <= 2000),
  -- Which master it came from: "document:<id>", "artifact:<id>", or "paste".
  source_ref text check (source_ref is null or length(source_ref) <= 80),
  artifact_id uuid,
  created_at timestamptz not null default now(),
  -- Set when an uploaded master already says the corrected line.
  resolved_at timestamptz,
  check (kind = 'misstated' or new_line is not null)
);

create index if not exists master_corrections_user_idx on public.master_corrections(user_id, created_at desc);

alter table public.master_corrections enable row level security;

drop policy if exists "master_corrections_own_rows" on public.master_corrections;
create policy "master_corrections_own_rows"
on public.master_corrections
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "master_corrections_select_admin" on public.master_corrections;
create policy "master_corrections_select_admin"
on public.master_corrections
for select
using (lower(coalesce(auth.jwt()->>'email', '')) = 'russell.innovation.group@gmail.com');
