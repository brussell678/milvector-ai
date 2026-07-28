-- Product updates / "What's New" feed.
-- Powers the announcement bar (between header and nav) and the What's New page.
-- Goal: reinforce that the product is alive and that user feedback turns into
-- real changes. An update may be flagged user-requested and optionally linked to
-- the support case it resolved (which fires a "your request is live" email).

create table if not exists public.product_updates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  category text not null default 'improvement' check (category in ('new', 'improvement', 'fix')),
  is_user_requested boolean not null default false,
  linked_feedback_id uuid references public.feedback(id) on delete set null,
  published boolean not null default true,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists product_updates_published_idx
  on public.product_updates(published, published_at desc);

alter table public.product_updates enable row level security;

-- Anyone may read published updates (the app is behind auth anyway).
drop policy if exists "product_updates_read_published" on public.product_updates;
create policy "product_updates_read_published"
on public.product_updates
for select
using (published = true);

-- Only the admin may create/edit/remove updates (and read drafts).
drop policy if exists "product_updates_admin_all" on public.product_updates;
create policy "product_updates_admin_all"
on public.product_updates
for all
using (lower(coalesce(auth.jwt()->>'email', '')) = 'russell.innovation.group@gmail.com')
with check (lower(coalesce(auth.jwt()->>'email', '')) = 'russell.innovation.group@gmail.com');

-- Seed with the work shipped today (2026-07-27). The awards item came from an
-- off-platform conversation, so it is user-requested with no linked case.
insert into public.product_updates (title, body, category, is_user_requested, published_at)
select * from (
  values
    (
      'Add your awards to your Master Resume',
      'You can now upload an award Summary of Action (or citation) and the Master Resume Builder folds its scope and impact into the right role — without double-counting what your FITREPs already cover. Upload the Summary of Action if you have it; the citation works too.',
      'new',
      true,
      now()
    ),
    (
      'Job Description Decoder now reads your real fit',
      'If you have a master resume saved, the Decoder now compares the posting against your actual background and gives you an honest fit read — where you match, the real gaps, and a straight go / stretch / not-worth-it recommendation. No master resume yet? It will tell you, and you can build one first.',
      'improvement',
      false,
      now() - interval '5 minutes'
    ),
    (
      'An honest review on every targeted resume',
      'Targeted resumes now come with a candid "read before you send" review that tells you where the resume is weak and how to strengthen it. The tools will never invent a clearance, degree, or metric to match a posting — your record stays true to your record.',
      'improvement',
      false,
      now() - interval '10 minutes'
    ),
    (
      'Larger screenshots on support requests',
      'Attaching a screenshot or file to a support case now works reliably, including larger images, so it is easier to show us exactly what you are seeing.',
      'fix',
      false,
      now() - interval '15 minutes'
    )
) as seed(title, body, category, is_user_requested, published_at)
where not exists (select 1 from public.product_updates);
