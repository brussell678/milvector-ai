-- Add explicit master_resume artifact/doc types for better targeting workflow.

alter table public.documents
drop constraint if exists documents_doc_type_check;

alter table public.documents
add constraint documents_doc_type_check
check (doc_type in ('FITREP', 'EVAL', 'VMET', 'JST', 'MASTER_RESUME', 'OTHER'));

alter table public.resume_artifacts
drop constraint if exists resume_artifacts_artifact_type_check;

alter table public.resume_artifacts
add constraint resume_artifacts_artifact_type_check
check (artifact_type in ('master_bullets', 'master_resume', 'targeted_resume'));
