-- Awards (Summary of Action / citation) as a first-class source document type.
-- Awards enrich billets already established by FITREPs/EVALs; they never create
-- a new timeline entry. See promptMasterResumeFromMilitaryDocs authority rules.

alter table public.documents
drop constraint if exists documents_doc_type_check;

alter table public.documents
add constraint documents_doc_type_check
check (doc_type in ('FITREP', 'EVAL', 'VMET', 'JST', 'AWARD', 'MASTER_RESUME', 'RESUME_TEMPLATE', 'TARGETED_RESUME', 'LINKEDIN_PROFILE', 'OTHER'));
