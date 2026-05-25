# Sprint 09 QA and Hardening

## Goal

Stabilize the full overhaul before release.

## Tasks

- Run production build.
- Test auth flows.
- Test viewport widths: 360px, 390px, 430px, 768px, 1024px.
- Fix layout overflow.
- Verify Vercel deployment.
- Confirm Supabase auth behavior.
- Confirm route protection still works.
- Confirm magic link still works.

## Acceptance Criteria

- Production build passes.
- Auth works.
- Magic link remains available.
- Email/password login works.
- No major mobile layout issues.
- Site deploys successfully.

## Closeout Notes

Completed on 2026-05-25.

- Ran `npm run lint` and `npm run build`; both passed.
- Installed Playwright Chromium locally for screenshot QA.
- Captured public route screenshots at 360px, 390px, 430px, 768px, and 1024px.
- Found and fixed the fixed-footer overlay issue by moving `.site-footer` into normal document flow.
- Verified unauthenticated `/app/*` route protection redirects to `/auth`.
- Updated productization readiness and smoke-test checklist with local verification results and remaining live-environment checks.
