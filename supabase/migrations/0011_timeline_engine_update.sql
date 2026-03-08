-- MilVector AI timeline engine update: richer transition tasks, supporting tasks, and link metadata

alter table public.transition_tasks
add column if not exists category text,
add column if not exists anchor_event text check (anchor_event in ('EAS', 'TERMINAL', 'PTAD', 'CEREMONY')),
add column if not exists days_before_event int,
add column if not exists phase text,
add column if not exists task_type text not null default 'milestone' check (task_type in ('milestone', 'informational')),
add column if not exists is_milestone boolean not null default true,
add column if not exists priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
add column if not exists assistance_type text not null default 'none' check (assistance_type in ('tool', 'doc', 'none')),
add column if not exists assistance_ref text,
add column if not exists assistance_notes text,
add column if not exists source_sheet text,
add column if not exists source_row int,
add column if not exists external_id text;

create unique index if not exists transition_tasks_external_id_uidx on public.transition_tasks(external_id) where external_id is not null;

create table if not exists public.transition_supporting_tasks (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.transition_tasks(id) on delete cascade,
  title text not null,
  description text,
  order_index int not null default 1,
  created_at timestamptz not null default now()
);

create index if not exists transition_supporting_tasks_task_idx on public.transition_supporting_tasks(task_id, order_index);

alter table public.transition_supporting_tasks enable row level security;

drop policy if exists "transition_supporting_tasks_read_all" on public.transition_supporting_tasks;
create policy "transition_supporting_tasks_read_all"
on public.transition_supporting_tasks
for select
using (true);

alter table public.library_links
add column if not exists source text,
add column if not exists review_status text not null default 'ready' check (review_status in ('ready', 'needs_review')),
add column if not exists raw_reference text,
add column if not exists external_id text,
add column if not exists source_sheet text,
add column if not exists source_row int;

create unique index if not exists library_links_external_id_uidx on public.library_links(external_id) where external_id is not null;
