# Sprint 02 Outbrief: Authentication Upgrade

## Status

Completed.

## Files Changed

- `app/auth/page.tsx`
- `components/auth/auth-form.tsx`
- `app/login/page.tsx`
- `app/auth/confirm/route.ts`
- `app/api/auth/signout/route.ts`
- `app/api/auth/sync-profile/route.ts`
- `app/api/profile/route.ts`
- `app/app/layout.tsx`
- `app/app/admin/page.tsx`
- `app/page.tsx`
- `app/platform/page.tsx`
- `app/privacy/page.tsx`
- `lib/auth-profile.ts`
- `lib/validators/profile.ts`
- `supabase/migrations/0024_auth_onboarding_profile_fields.sql`
- `docs/mobile_auth_overhaul_project_management/Sprints/Sprint_02_Authentication_Upgrade.md`
- `docs/mobile_auth_overhaul_project_management/Sprints/Outbriefs/Sprint_02_Outbrief.md`
- `docs/mobile_auth_overhaul_project_management/21_Sprint_Iteration_Backlog.md`

## Behavior Changed

- Added `/auth` as the primary auth entry point.
- Added password login as the default auth method.
- Added signup with required onboarding fields: email, password, confirm password, branch, and EAS date.
- Added optional signup fields: rank, MOS, terminal leave start, PTAD start, and retirement ceremony date.
- Preserved magic link login as a secondary tab with restricted-network helper text.
- Added forgot-password and update-password flows.
- Preserved `/login` as a compatibility redirect to `/auth`.
- Updated protected-route redirects and signout redirects to `/auth`.
- Added authenticated profile sync after signup/login/auth callback.
- Added additive Supabase migration for profile fields needed by auth onboarding.

## Build Verification

- Command: `npm run build`
- Result: Passed. Next.js compiled successfully and generated all routes, including `/auth` and `/api/auth/sync-profile`.

## Lint Verification

- Command: `npm run lint`
- Result: Passed.

## Auth Verification

- Email/password signup: Implemented. Manual end-to-end verification pending Supabase provider/settings check.
- Email/password login: Implemented. Manual end-to-end verification pending Supabase provider/settings check.
- Magic link: Preserved through `/auth` and `/auth/confirm`. Manual email callback verification pending.
- Password reset: Implemented through `/auth` reset request and `/auth?mode=update-password`. Manual email callback verification pending.
- Logout: Implemented and redirected to `/auth`; route builds.
- Profile sync: Implemented through `/api/auth/sync-profile` and auth callback sync. Requires migration `0024_auth_onboarding_profile_fields.sql`.

## Manual Supabase Checks

- Email provider settings: Verify email/password signups are enabled in Supabase Auth settings.
- Redirect URLs: Add/verify local and production callback URLs, including `http://localhost:3000/auth/confirm` and `https://milvector.org/auth/confirm`.
- Password reset redirect: Verify recovery links are allowed to return through `/auth/confirm?next=/auth?mode=update-password`.
- Migration: Apply `supabase/migrations/0024_auth_onboarding_profile_fields.sql` before relying on signup/profile sync in production.

## Accepted

- [x] User can sign up with email/password
- [x] User can log in with email/password
- [x] User can still request magic link
- [x] User can request password reset
- [x] User can log out
- [x] Errors display cleanly
- [x] Auth forms are mobile-friendly

Note: Acceptance is code/build verified. Live auth email behavior still requires Supabase settings and redirect URL verification.

## Deferred Work

- Full mobile navigation remains Sprint 3.
- Profile page UI for editing terminal leave, PTAD, and ceremony dates remains a later profile/forms refinement.
- Live auth email testing remains pending until Supabase settings are verified.

## Notes For Sprint 03

- `/auth` is now the preferred auth entry point.
- `/login` remains as a compatibility redirect and should not need special mobile navigation treatment.
- Sprint 3 should link unauthenticated "Open Workspace" actions to `/auth`.
- Logout is available through the existing app header; Sprint 3 should make sure it remains reachable on mobile navigation.
