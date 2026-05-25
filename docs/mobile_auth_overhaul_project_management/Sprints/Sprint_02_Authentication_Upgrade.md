# Sprint 02 Authentication Upgrade

## Goal

Add email/password authentication while preserving magic link authentication.

## Tasks

- Create or update `/auth`.
- Add password login form.
- Add signup form.
- Add magic link form.
- Add forgot password flow.
- Connect forms to Supabase Auth.
- Ensure profile creation or sync after signup/login.
- Keep forms mobile-friendly.
- Run `npm run build`.

## Acceptance Criteria

- User can sign up with email/password.
- User can log in with email/password.
- User can still request magic link.
- User can request password reset.
- User can log out.
- Errors display cleanly.
- Auth forms are mobile-friendly.

## Closeout Notes

Completed.

## Summary

Sprint 2 introduced the new `/auth` route with password-first authentication while preserving magic link authentication.

Completed:

- Added `/auth` page.
- Added password login.
- Added email/password signup with onboarding fields.
- Added magic link tab as alternate method.
- Added forgot password request flow.
- Added update password mode for password recovery callbacks.
- Preserved `/login` as a compatibility redirect to `/auth`.
- Updated protected route redirects to `/auth`.
- Added server-side profile sync after auth callbacks and client-side auth success.
- Added additive Supabase migration for auth onboarding profile fields.

Manual follow-up required:

- Apply `supabase/migrations/0024_auth_onboarding_profile_fields.sql`.
- Verify Supabase email/password provider is enabled.
- Verify Supabase redirect URLs include the local and production auth callback URLs.
