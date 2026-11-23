-- Digital Business Card: count visits from a saved contact. Run after 0041.
--
-- The contact file a visitor saves now links back to the card tagged
-- ?s=contact. This adds "contact" to the sources that are counted, so the
-- owner's Insights show people opening the card again from their phone's
-- contacts, a sign they are following up. Additive; until it runs those
-- visits count as "Shared link".

alter table public.business_card_stats drop constraint if exists business_card_stats_source_check;
alter table public.business_card_stats
  add constraint business_card_stats_source_check
  check (source in ('direct', 'qr', 'wallet', 'nfc', 'sig', 'video', 'print', 'lock', 'contact'));

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
  if p_source not in ('direct', 'qr', 'wallet', 'nfc', 'sig', 'video', 'print', 'lock', 'contact') then p_source := 'direct'; end if;
  select c.id into v_card from public.business_cards c
  where c.slug = lower(p_slug) and c.published and not c.suspended;
  if v_card is null then return; end if;
  insert into public.business_card_stats (card_id, day, kind, source, count)
  values (v_card, (now() at time zone 'utc')::date, p_kind, p_source, 1)
  on conflict (card_id, day, kind, source) do update set count = public.business_card_stats.count + 1;
end;
$$;

-- Same as 0041 with "contact" accepted as a source.
create or replace function public.submit_card_lead(
  p_slug text, p_name text, p_email text, p_phone text, p_company text, p_note text, p_source text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_card uuid;
  v_owner uuid;
  v_event text;
  v_id uuid;
begin
  select c.id, c.user_id, case when c.event_until > now() then nullif(trim(c.event_name), '') end
  into v_card, v_owner, v_event
  from public.business_cards c
  where c.slug = lower(p_slug) and c.published and not c.suspended
    and coalesce((c.data->>'leadCapture')::boolean, true);
  if v_card is null then return null; end if;
  if length(coalesce(trim(p_name), '')) < 2 then return null; end if;
  if coalesce(trim(p_email), '') = '' and coalesce(trim(p_phone), '') = '' then return null; end if;
  if (select count(*) from public.business_card_leads l
      where l.card_id = v_card and l.created_at > now() - interval '1 day') >= 50 then
    return null;
  end if;

  insert into public.business_card_leads (card_id, owner_id, name, email, phone, company, note, source, event_name)
  values (
    v_card, v_owner, left(trim(p_name), 80),
    nullif(left(trim(coalesce(p_email, '')), 120), ''),
    nullif(left(trim(coalesce(p_phone, '')), 30), ''),
    nullif(left(trim(coalesce(p_company, '')), 80), ''),
    nullif(left(trim(coalesce(p_note, '')), 300), ''),
    case when p_source in ('direct', 'qr', 'wallet', 'nfc', 'sig', 'video', 'print', 'lock', 'contact') then p_source else 'direct' end,
    v_event
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.record_card_event(text, text, text) from public;
revoke all on function public.submit_card_lead(text, text, text, text, text, text, text) from public;
grant execute on function public.record_card_event(text, text, text) to anon, authenticated;
grant execute on function public.submit_card_lead(text, text, text, text, text, text, text) to anon, authenticated;
