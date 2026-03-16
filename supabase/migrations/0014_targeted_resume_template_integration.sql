alter table public.documents
drop constraint if exists documents_doc_type_check;

alter table public.documents
add constraint documents_doc_type_check
check (doc_type in ('FITREP', 'EVAL', 'VMET', 'JST', 'MASTER_RESUME', 'RESUME_TEMPLATE', 'TARGETED_RESUME', 'OTHER'));

alter table public.resume_artifacts
add column if not exists structured_output jsonb,
add column if not exists rendered_document_id uuid references public.documents(id) on delete set null;

create index if not exists resume_artifacts_rendered_document_id_idx
  on public.resume_artifacts(rendered_document_id);
