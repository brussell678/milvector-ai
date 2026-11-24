-- The one-time confirmation on the VA Rating Navigator and the SBP Decision
-- Advisor (lib/legal/decision-notice.ts). Before a member's first use of
-- either tool, the page shows the notice ("Educational information only ...")
-- and a checkbox; confirming it adds a row here, so there is a record of who
-- confirmed which version of the notice, and when. A new notice version asks
-- again.
--
-- A member reads and adds only their own rows. Rows are never changed or
-- removed, except with the account (on delete cascade).

create table if not exists public.tool_acknowledgments (
  user_id uuid not null references auth.users(id) on delete cascade,
  tool text not null check (tool in ('va', 'sbp')),
  notice_version integer not null check (notice_version > 0),
  acknowledged_at timestamptz not null default now(),
  primary key (user_id, tool, notice_version)
);

alter table public.tool_acknowledgments enable row level security;

drop policy if exists "tool_acknowledgments_read_own" on public.tool_acknowledgments;
create policy "tool_acknowledgments_read_own"
on public.tool_acknowledgments
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "tool_acknowledgments_add_own" on public.tool_acknowledgments;
create policy "tool_acknowledgments_add_own"
on public.tool_acknowledgments
for insert
to authenticated
with check (auth.uid() = user_id);
