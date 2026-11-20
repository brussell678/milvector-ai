-- The Targeted Resume Builder's structured master resumes.
--
-- The builder splits the member's master resume into roles, lines, and
-- credentials once per version of its text, so code can check every targeted
-- resume against it. This table keeps that structure on the server, keyed by a
-- hash of the master's text: built once per version, reused for every posting,
-- and never passed through the browser. Each row holds only text the member
-- wrote in their own master, verified word for word.
--
-- Additive only: one new table with an own-rows policy. Safe to run more
-- than once. Until it is run, the builder rebuilds the structure each time.

create table if not exists public.master_resume_structures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  -- Which master it came from: "document:<id>", "artifact:<id>", or "paste".
  source_ref text check (source_ref is null or length(source_ref) <= 80),
  record jsonb not null,
  support_lines jsonb not null default '[]'::jsonb,
  dropped jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, content_hash)
);

create index if not exists master_resume_structures_user_idx on public.master_resume_structures(user_id, created_at desc);

alter table public.master_resume_structures enable row level security;

drop policy if exists "master_resume_structures_own_rows" on public.master_resume_structures;
create policy "master_resume_structures_own_rows"
on public.master_resume_structures
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
