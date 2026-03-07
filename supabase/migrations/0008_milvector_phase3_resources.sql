-- MilVector AI Phase 3: feedback, knowledge base, and library resources

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  name text,
  email text,
  branch text,
  mos text,
  feedback_type text not null check (feedback_type in ('bug', 'suggestion', 'general', 'tool_request')),
  message text not null,
  suggested_tool text,
  attachment_url text,
  status text not null default 'new' check (status in ('new', 'reviewing', 'resolved', 'archived'))
);

create table if not exists public.knowledge_articles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null,
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.library_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  category text not null,
  file_url text not null,
  uploaded_by uuid references auth.users(id) on delete set null,
  approved boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.library_links (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  category text not null,
  url text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.library_submissions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  category text not null,
  file_url text not null,
  submitted_by uuid not null references auth.users(id) on delete cascade,
  approved boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists feedback_created_at_idx on public.feedback(created_at desc);
create index if not exists knowledge_articles_category_idx on public.knowledge_articles(category, created_at desc);
create index if not exists library_documents_approved_idx on public.library_documents(approved, created_at desc);
create index if not exists library_links_category_idx on public.library_links(category, created_at desc);
create index if not exists library_submissions_submitted_by_idx on public.library_submissions(submitted_by, created_at desc);

alter table public.feedback enable row level security;
alter table public.knowledge_articles enable row level security;
alter table public.library_documents enable row level security;
alter table public.library_links enable row level security;
alter table public.library_submissions enable row level security;

drop policy if exists "feedback_insert_all" on public.feedback;
create policy "feedback_insert_all"
on public.feedback
for insert
with check (true);

drop policy if exists "feedback_select_own" on public.feedback;
create policy "feedback_select_own"
on public.feedback
for select
using (auth.uid() = user_id);

drop policy if exists "knowledge_articles_read_all" on public.knowledge_articles;
create policy "knowledge_articles_read_all"
on public.knowledge_articles
for select
using (true);

drop policy if exists "library_documents_read_approved" on public.library_documents;
create policy "library_documents_read_approved"
on public.library_documents
for select
using (approved = true);

drop policy if exists "library_links_read_all" on public.library_links;
create policy "library_links_read_all"
on public.library_links
for select
using (true);

drop policy if exists "library_submissions_insert_own" on public.library_submissions;
create policy "library_submissions_insert_own"
on public.library_submissions
for insert
with check (auth.uid() = submitted_by);

drop policy if exists "library_submissions_select_own" on public.library_submissions;
create policy "library_submissions_select_own"
on public.library_submissions
for select
using (auth.uid() = submitted_by);

insert into storage.buckets (id, name, public)
values ('library-submissions', 'library-submissions', false)
on conflict (id) do nothing;

drop policy if exists "library_submissions_bucket_read_own" on storage.objects;
create policy "library_submissions_bucket_read_own"
on storage.objects
for select
using (
  bucket_id = 'library-submissions'
  and auth.uid()::text = split_part(name, '/', 1)
);

drop policy if exists "library_submissions_bucket_insert_own" on storage.objects;
create policy "library_submissions_bucket_insert_own"
on storage.objects
for insert
with check (
  bucket_id = 'library-submissions'
  and auth.uid()::text = split_part(name, '/', 1)
);

insert into public.knowledge_articles (title, category, content)
select * from (
  values
    ('Build Your Transition Timeline', 'Transition Planning', 'Set your EAS date, define target roles, and work milestones backwards by phase.'),
    ('How to Translate MOS into Civilian Language', 'Military to Civilian Translation', 'Convert mission outcomes into business impact, scale, and leadership terms.'),
    ('VA Benefits Quick Start', 'VA Benefits', 'Start disability and education paperwork early to avoid post-separation delays.'),
    ('SkillBridge Planning', 'Employment', 'Identify approved opportunities and align timing with your command and EAS window.')
) as seed(title, category, content)
where not exists (select 1 from public.knowledge_articles ka where ka.title = seed.title);

insert into public.library_links (title, description, category, url)
select * from (
  values
    ('GI Bill Comparison Tool', 'Compare GI Bill options by school and program.', 'Education', 'https://www.va.gov/education/gi-bill-comparison-tool/'),
    ('SkillBridge Program', 'Official SkillBridge program overview and opportunities.', 'Employment', 'https://skillbridge.osd.mil/'),
    ('ClearanceJobs', 'Job board for cleared and clearance-eligible roles.', 'Employment', 'https://www.clearancejobs.com/'),
    ('VA Benefits Portal', 'Manage VA benefits and records online.', 'VA Benefits', 'https://www.va.gov/')
) as seed(title, description, category, url)
where not exists (select 1 from public.library_links ll where ll.title = seed.title);