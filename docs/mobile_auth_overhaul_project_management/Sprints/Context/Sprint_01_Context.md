# Sprint 01 Context: Audit and Foundation

## Read First

- `../../Sprint Roadmap/README.md`
- `../../22_Definition_of_Done.md`
- `../../../milvector_mobile_auth_overhaul_prd.md`

## Sprint Goal

Create responsive layout foundations and audit mobile risk without changing business logic.

## Starting Assumptions

- Current app uses Next.js App Router, TypeScript, TailwindCSS, Supabase, and shared global CSS.
- Existing routes and product behavior must be preserved.
- Auth changes are explicitly out of scope for this sprint.

## Allowed Work

- Create shared layout primitives such as `PageContainer`, `AppShell`, `MobileHeader`, `DesktopNav`, or equivalent.
- Normalize page-level spacing and max-width patterns.
- Audit current route mobile risks.
- Update documentation with audit results.

## Out of Scope

- Email/password auth
- Supabase schema changes
- Dashboard logic changes
- AI tool API changes
- Message board behavior changes

## Verification

- Run `npm run build`.
- Run `npm run lint` if TypeScript/JSX changes are made.

## Required Outbrief

Complete `../Outbriefs/Sprint_01_Outbrief.md` before closing.

