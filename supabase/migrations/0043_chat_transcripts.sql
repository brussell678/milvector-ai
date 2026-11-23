-- Chat tools: a chat saved to My Files (docs/CHAT_TOOLS_PLAN.md, 1.6).
--
-- Adds CHAT_TRANSCRIPT to the file types documents accepts. A member's saved
-- chat is a Word file in My Files, shown as "Saved chat", and is deleted with
-- their account like every other file. Additive; until it runs, Save to My
-- Files says it is not switched on yet and Download still works.

alter table public.documents drop constraint if exists documents_doc_type_check;
alter table public.documents
  add constraint documents_doc_type_check
  check (doc_type in ('FITREP', 'EVAL', 'VMET', 'JST', 'AWARD', 'MASTER_RESUME', 'RESUME_TEMPLATE', 'TARGETED_RESUME', 'LINKEDIN_PROFILE', 'CHAT_TRANSCRIPT', 'OTHER'));
