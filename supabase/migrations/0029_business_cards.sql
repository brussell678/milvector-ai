-- Digital Business Card (Phase 4).
-- Additive only: three new tables and five functions. Nothing existing changes.
--
-- Design: a card is private to its owner. The public page never reads the
-- table directly. It goes through get_public_card(slug), which returns one
-- published card by exact address, so nobody can list or scrape every card
-- with the public API key. Visit counts and contact exchange also go through
-- functions that check the card is live and cap abuse.

-- ─── Cards ───────────────────────────────────────────────────────────

create table if not exists public.business_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  data jsonb not null default '{}'::jsonb,
  photo_jpeg text check (photo_jpeg is null or length(photo_jpeg) <= 220000),
  photo_png text check (photo_png is null or length(photo_png) <= 320000),
  published boolean not null default false,
  -- Set by the admin to take a card down. The owner cannot clear it.
  suspended boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists business_cards_user_id_idx on public.business_cards(user_id);

drop trigger if exists business_cards_set_updated_at on public.business_cards;
create trigger business_cards_set_updated_at
before update on public.business_cards
for each row execute procedure public.set_updated_at();

-- Guard rails the row policies cannot express: three cards per member, and
-- only the admin (or the service role) may change the suspended flag.
create or replace function public.business_cards_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_admin boolean := lower(coalesce(auth.jwt()->>'email', '')) = 'russell.innovation.group@gmail.com'
                      or coalesce(auth.role(), '') = 'service_role';
begin
  if tg_op = 'INSERT' then
    if not is_admin then
      new.suspended := false;
    end if;
    if (select count(*) from public.business_cards where user_id = new.user_id) >= 3 then
      raise exception 'A member can have at most 3 cards.';
    end if;
  elsif tg_op = 'UPDATE' then
    if new.suspended is distinct from old.suspended and not is_admin then
      new.suspended := old.suspended;
    end if;
    new.user_id := old.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists business_cards_guard_trigger on public.business_cards;
create trigger business_cards_guard_trigger
before insert or update on public.business_cards
for each row execute procedure public.business_cards_guard();

alter table public.business_cards enable row level security;

drop policy if exists "business_cards_own_rows" on public.business_cards;
create policy "business_cards_own_rows"
on public.business_cards
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- The admin can read every card and update it (to suspend one that was reported).
drop policy if exists "business_cards_admin_read" on public.business_cards;
create policy "business_cards_admin_read"
on public.business_cards
for select
using (lower(coalesce(auth.jwt()->>'email', '')) = 'russell.innovation.group@gmail.com');

drop policy if exists "business_cards_admin_update" on public.business_cards;
create policy "business_cards_admin_update"
on public.business_cards
for update
using (lower(coalesce(auth.jwt()->>'email', '')) = 'russell.innovation.group@gmail.com')
with check (lower(coalesce(auth.jwt()->>'email', '')) = 'russell.innovation.group@gmail.com');

-- ─── Daily counts ────────────────────────────────────────────────────
-- One row per card, day, kind, and source. Counts only, no visitor data,
-- so the table cannot grow without bound and holds nothing personal.

create table if not exists public.business_card_stats (
  card_id uuid not null references public.business_cards(id) on delete cascade,
  day date not null,
  kind text not null check (kind in ('view', 'save', 'link', 'apple', 'google')),
  source text not null check (source in ('direct', 'qr', 'wallet', 'nfc', 'sig')),
  count integer not null default 0,
  primary key (card_id, day, kind, source)
);

alter table public.business_card_stats enable row level security;

drop policy if exists "business_card_stats_owner_read" on public.business_card_stats;
create policy "business_card_stats_owner_read"
on public.business_card_stats
for select
using (exists (select 1 from public.business_cards c where c.id = card_id and c.user_id = auth.uid()));

-- ─── Contacts shared with the card owner ─────────────────────────────

create table if not exists public.business_card_leads (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.business_cards(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(name) <= 80),
  email text check (email is null or length(email) <= 120),
  phone text check (phone is null or length(phone) <= 30),
  company text check (company is null or length(company) <= 80),
  note text check (note is null or length(note) <= 300),
  source text not null default 'direct',
  created_at timestamptz not null default now()
);

create index if not exists business_card_leads_owner_idx on public.business_card_leads(owner_id, created_at desc);
create index if not exists business_card_leads_card_idx on public.business_card_leads(card_id, created_at desc);

alter table public.business_card_leads enable row level security;

drop policy if exists "business_card_leads_owner_read" on public.business_card_leads;
create policy "business_card_leads_owner_read"
on public.business_card_leads
for select
using (auth.uid() = owner_id);

drop policy if exists "business_card_leads_owner_delete" on public.business_card_leads;
create policy "business_card_leads_owner_delete"
on public.business_card_leads
for delete
using (auth.uid() = owner_id);

-- ─── Public functions ────────────────────────────────────────────────

create or replace function public.get_public_card(p_slug text)
returns table (id uuid, slug text, data jsonb, has_photo boolean, updated_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.slug, c.data, (c.photo_jpeg is not null), c.updated_at
  from public.business_cards c
  where c.slug = lower(p_slug) and c.published and not c.suspended
  limit 1;
$$;

create or replace function public.get_public_card_photo(p_slug text, p_format text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case when p_format = 'png' then c.photo_png else c.photo_jpeg end
  from public.business_cards c
  where c.slug = lower(p_slug) and c.published and not c.suspended
  limit 1;
$$;

create or replace function public.record_card_event(p_slug text, p_kind text, p_source text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_card uuid;
begin
  if p_kind not in ('view', 'save', 'link', 'apple', 'google') then return; end if;
  if p_source not in ('direct', 'qr', 'wallet', 'nfc', 'sig') then p_source := 'direct'; end if;
  select c.id into v_card from public.business_cards c
  where c.slug = lower(p_slug) and c.published and not c.suspended;
  if v_card is null then return; end if;
  insert into public.business_card_stats (card_id, day, kind, source, count)
  values (v_card, (now() at time zone 'utc')::date, p_kind, p_source, 1)
  on conflict (card_id, day, kind, source) do update set count = public.business_card_stats.count + 1;
end;
$$;

-- Returns the new contact's id, or null when the card is not accepting
-- contacts or has reached its daily cap (50 a day, to blunt spam floods).
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
  v_id uuid;
begin
  select c.id, c.user_id into v_card, v_owner from public.business_cards c
  where c.slug = lower(p_slug) and c.published and not c.suspended
    and coalesce((c.data->>'leadCapture')::boolean, true);
  if v_card is null then return null; end if;
  if length(coalesce(trim(p_name), '')) < 2 then return null; end if;
  if coalesce(trim(p_email), '') = '' and coalesce(trim(p_phone), '') = '' then return null; end if;
  if (select count(*) from public.business_card_leads l
      where l.card_id = v_card and l.created_at > now() - interval '1 day') >= 50 then
    return null;
  end if;
  insert into public.business_card_leads (card_id, owner_id, name, email, phone, company, note, source)
  values (
    v_card, v_owner, left(trim(p_name), 80),
    nullif(left(trim(coalesce(p_email, '')), 120), ''),
    nullif(left(trim(coalesce(p_phone, '')), 30), ''),
    nullif(left(trim(coalesce(p_company, '')), 80), ''),
    nullif(left(trim(coalesce(p_note, '')), 300), ''),
    case when p_source in ('direct', 'qr', 'wallet', 'nfc', 'sig') then p_source else 'direct' end
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.get_public_card(text) from public;
revoke all on function public.get_public_card_photo(text, text) from public;
revoke all on function public.record_card_event(text, text, text) from public;
revoke all on function public.submit_card_lead(text, text, text, text, text, text, text) from public;
grant execute on function public.get_public_card(text) to anon, authenticated;
grant execute on function public.get_public_card_photo(text, text) to anon, authenticated;
grant execute on function public.record_card_event(text, text, text) to anon, authenticated;
grant execute on function public.submit_card_lead(text, text, text, text, text, text, text) to anon, authenticated;
