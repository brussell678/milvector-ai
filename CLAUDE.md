# MilVector AI — working notes for Claude

## Shipping user-facing updates → WHATSNEW.md (do this automatically)

When a change to this project is **user-facing** — a new tool or feature, a
visible improvement, or a fix a user would notice — draft a plain-language entry
at the **top** of `WHATSNEW.md` as part of the same work, tagged `{draft}`.
You draft it; the user verifies. They should never have to hand-author these
from scratch.

Since 2026-11-23 the user reviews wording on the admin portal, not in chat:
a `{draft}` entry is inserted unpublished on push, the admin home
(`/app/admin`) shows a notice, and `/app/admin/updates` lets them edit,
publish, or delete it. Members see nothing until they publish. When a feature
needs a migration first, tell them to publish only after it has run.

On push to `main`, the **Publish What's New** GitHub Action
(`.github/workflows/whatsnew.yml` → `scripts/publish-whatsnew.mjs`) publishes any
new entries to the live feed: the announcement bar (`components/announcement-bar.tsx`,
wired in `app/app/layout.tsx`) and the What's New page (`app/app/whats-new/page.tsx`).

Entry format (newest first):

    ## <Title> {category} [{requested}]
    One or two sentences written for a transitioning service member — the benefit
    to them, in plain language, not the implementation.

- `category` is one of `new` | `improvement` | `fix` (default `improvement`).
- Add `{requested}` when a user asked for it (shows a "Requested by a user" badge).
- **Do not** add entries for non-user-facing work: refactors, infra, dependency
  bumps, or internal prompt tuning with no visible UX change. Keep the feed signal.
- Add `{draft}` to hold it for the user on the admin portal (the default, see above).
- Only entries new in each push are added, and titles already in the table are
  skipped, so an entry left in the file is harmless and a draft the user deleted
  or retitled stays that way. Changing a published entry's title in the file
  would add it again as a new entry.

For an update that resolves a specific in-app **support ticket** and should email
that reporter, use the admin composer at `/app/admin/updates` instead — it links
the case and sends the "your request is live" email. `WHATSNEW.md` is the general
changelog.

## Product-update data model

`product_updates` table (migration `0027`): `title`, `body`, `category`,
`is_user_requested`, `linked_feedback_id`, `published`, `published_at`. RLS: public
read of published rows; admin-only writes. The CI publisher uses the Supabase
secret key (GitHub Actions secret `SUPABASE_SECRET_KEY`) to bypass RLS.
