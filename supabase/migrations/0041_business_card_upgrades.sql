-- Digital Business Card upgrades: a banner image, three new ways people reach
-- a card (video call background, printed card, lock screen), and event mode
-- with private notes on the contacts a card collects. Run after 0029 and 0030.
--
-- Additive: new columns, two new functions, wider source lists, one new row
-- policy, submit_card_lead redefined with the same signature, and
-- card_follow_up added to the AI tools tool_runs accepts. Existing cards, counts, and contacts are untouched. Until this
-- runs the app still works: the editor says banners and event mode are not
-- set up, and the new sources are counted as "Shared link".

-- ─── Banner ──────────────────────────────────────────────────────────
-- One banner per card, 1584 x 396 (LinkedIn's banner size), stored as JPEG
-- base64 like the photo. banner_updated_at tells the page a banner exists and
-- busts caches when it changes, without loading the image.

alter table public.business_cards
  add column if not exists banner_jpeg text check (banner_jpeg is null or length(banner_jpeg) <= 400000),
  add column if not exists banner_updated_at timestamptz;

create or replace function public.get_public_card_banner(p_slug text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select c.banner_jpeg
  from public.business_cards c
  where c.slug = lower(p_slug) and c.published and not c.suspended
  limit 1;
$$;

create or replace function public.get_public_card_banner_version(p_slug text)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select c.banner_updated_at
  from public.business_cards c
  where c.slug = lower(p_slug) and c.published and not c.suspended and c.banner_jpeg is not null
  limit 1;
$$;

-- ─── New sources ─────────────────────────────────────────────────────

alter table public.business_card_stats drop constraint if exists business_card_stats_source_check;
alter table public.business_card_stats
  add constraint business_card_stats_source_check
  check (source in ('direct', 'qr', 'wallet', 'nfc', 'sig', 'video', 'print', 'lock'));

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
  if p_source not in ('direct', 'qr', 'wallet', 'nfc', 'sig', 'video', 'print', 'lock') then p_source := 'direct'; end if;
  select c.id into v_card from public.business_cards c
  where c.slug = lower(p_slug) and c.published and not c.suspended;
  if v_card is null then return; end if;
  insert into public.business_card_stats (card_id, day, kind, source, count)
  values (v_card, (now() at time zone 'utc')::date, p_kind, p_source, 1)
  on conflict (card_id, day, kind, source) do update set count = public.business_card_stats.count + 1;
end;
$$;

-- ─── Event mode and private notes on contacts ────────────────────────
-- The card's event lives in its own columns, not in data: get_public_card
-- hands data to anyone with the public key, and an event name with an end
-- time would tell a stranger where the member is right now.
-- On a contact, event_name is set by submit_card_lead while event mode is on,
-- and owner_note is the owner's own note (the visitor's message stays in note).

alter table public.business_cards
  add column if not exists event_name text check (event_name is null or length(event_name) <= 80),
  add column if not exists event_until timestamptz;

alter table public.business_card_leads
  add column if not exists event_name text check (event_name is null or length(event_name) <= 80),
  add column if not exists owner_note text check (owner_note is null or length(owner_note) <= 500);

drop policy if exists "business_card_leads_owner_update" on public.business_card_leads;
create policy "business_card_leads_owner_update"
on public.business_card_leads
for update
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

-- Same signature and checks as 0029. Now also tags the contact with the
-- card's event while event mode is on (event_name until event_until), and
-- accepts the new sources. The tag comes from the card, never the visitor.
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
    case when p_source in ('direct', 'qr', 'wallet', 'nfc', 'sig', 'video', 'print', 'lock') then p_source else 'direct' end,
    v_event
  )
  returning id into v_id;
  return v_id;
end;
$$;

-- ─── AI follow-up drafts are logged like every other AI run ──────────
-- tool_runs only accepts named tools (0028). Without this, a follow-up draft
-- would fail to log, and would neither count toward the daily AI limit nor
-- show in the admin usage view.

alter table public.tool_runs drop constraint if exists tool_runs_tool_name_check;
alter table public.tool_runs
  add constraint tool_runs_tool_name_check
  check (tool_name in (
    'fitrep_bullets',
    'mos_translator',
    'jd_decoder',
    'resume_targeter',
    'linkedin_builder',
    'interview_strategist',
    'va_rating_navigator',
    'sbp_advisor',
    'card_follow_up'
  ));

revoke all on function public.get_public_card_banner(text) from public;
revoke all on function public.get_public_card_banner_version(text) from public;
revoke all on function public.record_card_event(text, text, text) from public;
revoke all on function public.submit_card_lead(text, text, text, text, text, text, text) from public;
grant execute on function public.get_public_card_banner(text) to anon, authenticated;
grant execute on function public.get_public_card_banner_version(text) to anon, authenticated;
grant execute on function public.record_card_event(text, text, text) to anon, authenticated;
grant execute on function public.submit_card_lead(text, text, text, text, text, text, text) to anon, authenticated;
