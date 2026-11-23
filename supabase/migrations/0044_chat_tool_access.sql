-- Which chat views members see (docs/CHAT_TOOLS_PLAN.md, Phase 6). The admin
-- always sees every chat. A tool whose row says open_to_members shows its chat
-- to every member too; otherwise members keep the classic page. The admin
-- flips these on the admin portal, and a change shows on the next page load,
-- with no redeploy. This replaces the CHAT_TOOLS_PUBLIC setting.
--
-- One row per chat tool, by the short name the app uses. Nobody adds or
-- removes rows; the admin only changes them.

create table if not exists public.chat_tool_access (
  tool_key text primary key check (tool_key in ('mos', 'jd', 'resume', 'va', 'sbp')),
  open_to_members boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.chat_tool_access (tool_key)
values ('mos'), ('jd'), ('resume'), ('va'), ('sbp')
on conflict (tool_key) do nothing;

alter table public.chat_tool_access enable row level security;

-- Any signed-in member may read the switches: the pages check them to choose
-- the chat or the classic view. They say nothing about any member.
drop policy if exists "chat_tool_access_read" on public.chat_tool_access;
create policy "chat_tool_access_read"
on public.chat_tool_access
for select
to authenticated
using (true);

-- Only the admin may flip them.
drop policy if exists "chat_tool_access_admin_update" on public.chat_tool_access;
create policy "chat_tool_access_admin_update"
on public.chat_tool_access
for update
to authenticated
using (lower(coalesce(auth.jwt()->>'email', '')) = 'russell.innovation.group@gmail.com')
with check (lower(coalesce(auth.jwt()->>'email', '')) = 'russell.innovation.group@gmail.com');
