# Sprint 02 Context: Authentication Upgrade

## Read First

- `../../Sprint Roadmap/README.md`
- `../../12_Configuration_Management_Plan.md`
- `../../27_Compliance_Privacy_Review.md`
- `../Outbriefs/Sprint_01_Outbrief.md`

## Sprint Goal

Add email/password authentication while preserving magic link authentication.

## Starting Assumptions

- Sprint 1 layout primitives are available or documented.
- `/auth` becomes the preferred route for auth.
- Existing magic-link behavior must remain available.

## Allowed Work

- Create or update `/auth`.
- Add password login.
- Add signup.
- Add forgot password.
- Keep magic link as a secondary auth method.
- Ensure profile row creation/sync after signup/login.
- Add additive migration if required profile fields are missing.

## Out of Scope

- Dashboard mobile refactor
- Navigation overhaul beyond auth route access
- AI tool changes
- Library/timeline refactors

## Manual Checks To Capture

- Supabase email/password provider enabled
- Redirect URL settings
- Password reset redirect behavior
- Magic link redirect behavior

## Verification

- Run `npm run build`.
- Run `npm run lint`.
- Manually test auth locally if environment permits.

## Required Outbrief

Complete `../Outbriefs/Sprint_02_Outbrief.md` before closing.

