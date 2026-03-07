-- Add profile fields needed for resume/contact templating.
alter table public.profiles
add column if not exists phone_number text,
add column if not exists professional_email text,
add column if not exists linkedin_url text,
add column if not exists location text,
add column if not exists security_clearance text;
