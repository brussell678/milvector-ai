-- Add profile fields required by password auth onboarding.
alter table public.profiles
add column if not exists email text,
add column if not exists terminal_leave_start date,
add column if not exists ptad_start date,
add column if not exists retirement_ceremony_date date;

