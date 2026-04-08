alter table public.documents
drop constraint if exists documents_doc_type_check;

alter table public.documents
add constraint documents_doc_type_check
check (doc_type in ('FITREP', 'EVAL', 'VMET', 'JST', 'MASTER_RESUME', 'RESUME_TEMPLATE', 'TARGETED_RESUME', 'LINKEDIN_PROFILE', 'OTHER'));
