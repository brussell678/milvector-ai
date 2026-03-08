-- Add off-duty civilian education/certification fields to profile context.
alter table public.profiles
add column if not exists off_duty_education text[] default '{}'::text[],
add column if not exists civilian_certifications text[] default '{}'::text[],
add column if not exists additional_training text[] default '{}'::text[];
