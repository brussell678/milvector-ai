# Sprint 01 Audit and Foundation

## Goal

Create responsive layout foundations without changing business logic.

## Tasks

- Audit current app routes and shared layout components.
- Identify pages with poor mobile behavior.
- Create or update reusable layout components.
- Apply mobile-first container spacing patterns.
- Preserve existing routes and business logic.
- Run `npm run build`.

## Acceptance Criteria

- Site builds.
- Shared layout components exist.
- No routes broken.
- Major pages have consistent outer spacing.
- No major horizontal overflow introduced.

## Closeout Notes

Completed.

## Audit Summary

Routes and components reviewed:

- Public shell: `/`, `/platform`, `/privacy`, `/donate`, `/library`, `/feedback`, `/knowledge-base`, `/login`
- Authenticated shell: `/app/*`
- Shared navigation: `PrimaryNav`, `AppNav`
- Shared CSS primitives: `.page-shell`, `.page-hero`, `.section-card`, `.subtle-panel`, `.stat-card`, `.btn`, `.input`

Foundation changes completed:

- Added shared `PageContainer` component.
- Added shared `AppShell` wrapper for authenticated pages.
- Added shared `DesktopNav` wrapper for the existing desktop public nav.
- Normalized public page containers to use consistent mobile-first spacing.
- Updated authenticated app layout to use the shared shell.
- Added baseline 44px touch targets for `.btn` and `.input`.
- Added min-width protections for shared cards and shells.

Deferred to later sprints:

- Full mobile navigation remains Sprint 3.
- Dashboard component reordering remains Sprint 4.
- Timeline collapsible mobile cards remain Sprint 5.
- Tool-specific form/result refactors remain Sprint 6.
- Upload warning standardization remains Sprint 8.
