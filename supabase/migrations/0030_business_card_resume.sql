-- Digital Business Card: attach a resume from My Files.
-- Additive: four new columns, two new functions, and "resume" added to the
-- kinds of activity that are counted. Run after 0029.
--
-- The resume on a card is a copy taken when the member picks it. Their files
-- stay private, and editing or replacing a file later never changes what a
-- public card hands out until they pick again.

alter table public.business_cards
  add column if not exists resume_data text check (resume_data is null or length(resume_data) <= 4300000),
  add column if not exists resume_name text check (resume_name is null or length(resume_name) <= 160),
  add column if not exists resume_mime text check (
    resume_mime is null or resume_mime in (
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )
  ),
  add column if not exists resume_updated_at timestamptz;

-- The file name only, so the card page can show a Resume button without
-- loading the file itself.
create or replace function public.get_public_card_resume_name(p_slug text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select c.resume_name
  from public.business_cards c
  where c.slug = lower(p_slug) and c.published and not c.suspended and c.resume_data is not null
  limit 1;
$$;

create or replace function public.get_public_card_resume(p_slug text)
returns table (name text, mime text, data text)
language sql
stable
security definer
set search_path = public
as $$
  select c.resume_name, c.resume_mime, c.resume_data
  from public.business_cards c
  where c.slug = lower(p_slug) and c.published and not c.suspended and c.resume_data is not null
  limit 1;
$$;

-- Count resume downloads alongside views and saves.
alter table public.business_card_stats drop constraint if exists business_card_stats_kind_check;
alter table public.business_card_stats
  add constraint business_card_stats_kind_check
  check (kind in ('view', 'save', 'link', 'apple', 'google', 'resume'));

create or replace function public.record_card_event(p_slug text, p_kind text, p_source text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_card uuid;
begin
  if p_kind not in ('view', 'save', 'link', 'apple', 'google', 'resume') then return; end if;
  if p_source not in ('direct', 'qr', 'wallet', 'nfc', 'sig') then p_source := 'direct'; end if;
  select c.id into v_card from public.business_cards c
  where c.slug = lower(p_slug) and c.published and not c.suspended;
  if v_card is null then return; end if;
  insert into public.business_card_stats (card_id, day, kind, source, count)
  values (v_card, (now() at time zone 'utc')::date, p_kind, p_source, 1)
  on conflict (card_id, day, kind, source) do update set count = public.business_card_stats.count + 1;
end;
$$;

revoke all on function public.get_public_card_resume_name(text) from public;
revoke all on function public.get_public_card_resume(text) from public;
grant execute on function public.get_public_card_resume_name(text) to anon, authenticated;
grant execute on function public.get_public_card_resume(text) to anon, authenticated;
