-- Add service-context fields to avoid retirement assumptions.
alter table public.profiles
add column if not exists service_component text,
add column if not exists years_service_at_eas numeric(4,1);
