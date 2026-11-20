-- The member's chosen master resume.
--
-- Every resume tool works from one master resume, and the member picks which
-- one: an uploaded MASTER_RESUME document (usually the version they refined
-- in Word) or a master resume MilVector wrote. MilVector never picks for
-- them. Stored as "document:<uuid>" or "artifact:<uuid>". The existing
-- profiles_own_rows policy already limits reading and writing it to the
-- member.
--
-- Additive only: one nullable column. Safe to run more than once.

alter table public.profiles
  add column if not exists master_resume_ref text;

alter table public.profiles
  drop constraint if exists profiles_master_resume_ref_check;

alter table public.profiles
  add constraint profiles_master_resume_ref_check
  check (
    master_resume_ref is null
    or master_resume_ref ~ '^(document|artifact):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  );
