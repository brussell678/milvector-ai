# MilVector AI — working notes for Claude

## Shipping user-facing updates → WHATSNEW.md (do this automatically)

When a change to this project is **user-facing** — a new tool or feature, a
visible improvement, or a fix a user would notice — draft a plain-language entry
at the **top** of `WHATSNEW.md` as part of the same work, and ask the user to
verify it before (or at) push. You draft it; the user verifies. They should
never have to hand-author these from scratch.

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
- Entries are deduped by title, so an already-published entry left in the file is
  harmless.

For an update that resolves a specific in-app **support ticket** and should email
that reporter, use the admin composer at `/app/admin/updates` instead — it links
the case and sends the "your request is live" email. `WHATSNEW.md` is the general
changelog.

## Product-update data model

`product_updates` table (migration `0027`): `title`, `body`, `category`,
`is_user_requested`, `linked_feedback_id`, `published`, `published_at`. RLS: public
read of published rows; admin-only writes. The CI publisher uses the Supabase
secret key (GitHub Actions secret `SUPABASE_SECRET_KEY`) to bypass RLS.
