# Sprint Roadmap

## Purpose

This roadmap is the operating plan for the MilVector AI mobile-first UI overhaul and email/password authentication release.

The project will be executed one sprint at a time to reduce context-window risk. Each sprint has:

- A sprint plan in `../Sprints/`
- A sprint context file in `../Sprints/Context/`
- A sprint outbrief template in `../Sprints/Outbriefs/`

Do not begin implementation until this roadmap is validated by the product owner.

## Source Documents

- PRD: `../../milvector_mobile_auth_overhaul_prd.md`
- Product backlog: `../18_Product_Backlog.md`
- Release backlog: `../20_Release_Backlog.md`
- Definition of done: `../22_Definition_of_Done.md`
- Smoke test checklist: `../29_V1_Smoke_Test_Checklist.md`

## Operating Rules

1. Work one sprint at a time.
2. Start every sprint by ingesting that sprint's context file.
3. Keep implementation limited to the sprint's allowed scope.
4. Run `npm run build` before sprint closeout.
5. Fill in the sprint outbrief before moving to the next sprint.
6. Use the previous sprint outbrief as part of the next sprint's context.
7. Do not perform destructive database changes.
8. Do not remove existing routes.
9. Do not refactor unrelated files.

## Roadmap Summary

| Sprint | Theme | Primary Outcome | Depends On | Build Gate |
| --- | --- | --- | --- | --- |
| 1 | Audit and Foundation | Shared responsive layout primitives and route audit | Validated roadmap | `npm run build` |
| 2 | Authentication Upgrade | `/auth` with email/password, magic link, forgot password, profile sync | Sprint 1 outbrief | `npm run build` |
| 3 | Mobile Navigation | Mobile header/nav drawer or bottom nav, active route states, mobile logout access | Sprint 1 and 2 outbriefs | `npm run build` |
| 4 | Dashboard Mobile Overhaul | Mobile-first command center layout | Sprint 3 outbrief | `npm run build` |
| 5 | Timeline Mobile Overhaul | Vertical/collapsible phase timeline | Sprint 4 outbrief | `npm run build` |
| 6 | Tools Mobile Overhaul | Mobile-safe AI tool flows and output panels | Sprint 5 outbrief | `npm run build` |
| 7 | Library and Knowledge Base | Mobile resource discovery and readable knowledge content | Sprint 6 outbrief | `npm run build` |
| 8 | Forms and Upload Warnings | Mobile form cleanup and required upload warnings everywhere | Sprint 7 outbrief | `npm run build` |
| 9 | QA and Hardening | End-to-end mobile/auth verification and release readiness | Sprints 1-8 outbriefs | `npm run build` |

## Sprint-by-Sprint Plan

### Sprint 1: Audit and Foundation

Create shared responsive layout components and document current mobile risk. This sprint should not change auth, dashboard logic, tool logic, or Supabase behavior.

Primary files likely touched:

- `components/layout/*`
- `components/ui/*`
- `app/layout.tsx`
- `app/app/layout.tsx`
- shared nav/container components

Closeout must identify pages requiring targeted mobile refactor in later sprints.

### Sprint 2: Authentication Upgrade

Add email/password authentication while keeping magic link available. Introduce `/auth` as the preferred auth route and preserve existing session handling.

Primary files likely touched:

- `app/auth/*`
- `components/auth/*`
- `components/login-form.tsx` or replacement compatibility wrapper
- `lib/supabase/*`
- `lib/auth.ts`
- additive Supabase migration if profile fields are missing

Closeout must list Supabase dashboard settings to verify manually.

### Sprint 3: Mobile Navigation

Make primary navigation usable on phones. Introduce mobile header and drawer or bottom navigation. Ensure logout is accessible on mobile.

Primary files likely touched:

- `components/layout/MobileHeader.tsx`
- `components/layout/MobileNav.tsx`
- `components/layout/MobileDrawer.tsx`
- `components/app-nav.tsx`
- `components/primary-nav.tsx`
- `app/layout.tsx`
- `app/app/layout.tsx`

Closeout must record 360px navigation behavior.

### Sprint 4: Dashboard Mobile Overhaul

Refactor `/app` into a mobile-first command center. Current phase, mission status, readiness, and next objective must appear early on mobile.

Primary files likely touched:

- `app/app/page.tsx`
- `components/dashboard/*`

Closeout must record any dashboard components deferred to later cleanup.

### Sprint 5: Transition Timeline Mobile Overhaul

Make `/app/timeline` readable on phones with vertical/collapsible phase cards and preserved completion logic.

Primary files likely touched:

- `app/app/timeline/page.tsx`
- `components/dashboard/TimelinePhaseBoard.tsx`
- `components/dashboard/TaskCard.tsx`
- `components/dashboard/TaskDrawer.tsx`

Closeout must verify completion behavior remains intact.

### Sprint 6: Tools Mobile Overhaul

Make AI tool flows usable on mobile. Inputs should appear before results, long guidance should collapse, and copy/download actions should be reachable.

Primary files likely touched:

- `app/app/tools/*/page.tsx`
- `app/app/tools/page.tsx`
- shared tool UI components if created

Do not change model prompts or API route behavior unless needed for a UI bug.

### Sprint 7: Library and Knowledge Base Mobile Overhaul

Improve resource discovery on small screens with cards, chips, accordions, and readable article layouts.

Primary files likely touched:

- `app/library/page.tsx`
- `app/app/library/page.tsx`
- `app/knowledge-base/page.tsx`
- `app/app/knowledge-base/page.tsx`
- `components/knowledge-base-sections.tsx`
- `components/library-*`

Closeout must list remaining content/readability gaps.

### Sprint 8: Forms and Upload Warnings

Standardize mobile forms and add the exact upload warning to every upload surface.

Required warning:

```txt
Before uploading documents, redact any sensitive personal information such as SSN, full date of birth, or home address.
```

Primary files likely touched:

- `components/ui/UploadWarning.tsx`
- `app/app/documents/page.tsx`
- `components/feedback-form.tsx`
- `components/library-submission-form.tsx`
- any other upload surface found during audit

Closeout must include an upload surface checklist.

### Sprint 9: QA and Hardening

Perform final QA, build, route verification, auth verification, and mobile viewport review.

Primary files likely touched:

- Bug fixes only
- Smoke checklist updates
- Productization readiness updates

Closeout must determine release readiness.

## Validation Questions

Before Sprint 1 begins, validate:

- Is this nine-sprint sequence approved?
- Should `/login` remain as a redirect/compatibility route after `/auth` is introduced?
- Should mobile navigation use bottom nav plus drawer, or header plus drawer only?
- Should project management docs be committed with Sprint 0 before implementation starts?

