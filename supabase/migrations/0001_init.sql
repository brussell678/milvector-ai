-- MILVECTOR AI MVP schema + RLS
-- Run this in Supabase SQL editor or via migration tooling.

create extension if not exists pgcrypto;

-- Profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  branch text not null default 'USMC',
  mos text,
  rank text,
  separation_date date,
  career_interests text[],
  location_pref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Documents metadata (file bytes are stored in Supabase Storage)
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  doc_type text not null check (doc_type in ('FITREP', 'EVAL', 'OTHER')),
  filename text not null,
  storage_path text not null unique,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  text_extracted boolean not null default false,
  extracted_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists documents_user_id_idx on public.documents(user_id);
create index if not exists documents_created_at_idx on public.documents(created_at desc);

-- LLM tool execution history
create table if not exists public.tool_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tool_name text not null check (tool_name in ('fitrep_bullets', 'mos_translator', 'jd_decoder', 'resume_targeter')),
  status text not null check (status in ('success', 'error')),
  input_json jsonb not null default '{}'::jsonb,
  output_json jsonb,
  error_message text,
  tokens_in int,
  tokens_out int,
  latency_ms int,
  created_at timestamptz not null default now()
);

create index if not exists tool_runs_user_id_idx on public.tool_runs(user_id);
create index if not exists tool_runs_created_at_idx on public.tool_runs(created_at desc);

-- Resume artifacts produced by tools
create table if not exists public.resume_artifacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  artifact_type text not null check (artifact_type in ('master_bullets', 'targeted_resume')),
  title text not null,
  content text not null,
  source_document_id uuid references public.documents(id) on delete set null,
  job_title_target text,
  company_target text,
  job_description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists resume_artifacts_user_id_idx on public.resume_artifacts(user_id);
create index if not exists resume_artifacts_created_at_idx on public.resume_artifacts(created_at desc);

-- updated_at helper
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute procedure public.set_updated_at();

drop trigger if exists documents_set_updated_at on public.documents;
create trigger documents_set_updated_at
before update on public.documents
for each row execute procedure public.set_updated_at();

drop trigger if exists resume_artifacts_set_updated_at on public.resume_artifacts;
create trigger resume_artifacts_set_updated_at
before update on public.resume_artifacts
for each row execute procedure public.set_updated_at();

-- RLS
alter table public.profiles enable row level security;
alter table public.documents enable row level security;
alter table public.tool_runs enable row level security;
alter table public.resume_artifacts enable row level security;

drop policy if exists "profiles_own_rows" on public.profiles;
create policy "profiles_own_rows"
on public.profiles
for all
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "documents_own_rows" on public.documents;
create policy "documents_own_rows"
on public.documents
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "tool_runs_own_rows" on public.tool_runs;
create policy "tool_runs_own_rows"
on public.tool_runs
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "resume_artifacts_own_rows" on public.resume_artifacts;
create policy "resume_artifacts_own_rows"
on public.resume_artifacts
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Storage bucket + policies for documents
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

drop policy if exists "documents_bucket_read_own" on storage.objects;
create policy "documents_bucket_read_own"
on storage.objects
for select
using (
  bucket_id = 'documents'
  and auth.uid()::text = split_part(name, '/', 1)
);

drop policy if exists "documents_bucket_insert_own" on storage.objects;
create policy "documents_bucket_insert_own"
on storage.objects
for insert
with check (
  bucket_id = 'documents'
  and auth.uid()::text = split_part(name, '/', 1)
);

drop policy if exists "documents_bucket_update_own" on storage.objects;
create policy "documents_bucket_update_own"
on storage.objects
for update
using (
  bucket_id = 'documents'
  and auth.uid()::text = split_part(name, '/', 1)
)
with check (
  bucket_id = 'documents'
  and auth.uid()::text = split_part(name, '/', 1)
);

drop policy if exists "documents_bucket_delete_own" on storage.objects;
create policy "documents_bucket_delete_own"
on storage.objects
for delete
using (
  bucket_id = 'documents'
  and auth.uid()::text = split_part(name, '/', 1)
);


