# Sprint 04 Dashboard Mobile Overhaul

## Goal

Refactor dashboard into a mobile-first command center.

## Tasks

- Stack dashboard cards on mobile.
- Refine mission status, current phase, and readiness score.
- Convert task tables or dense layouts to cards/checklists.
- Add task detail drawer, modal, or expandable panel if needed.
- Keep current phase and next objectives near top.
- Run `npm run build`.

## Acceptance Criteria

- Dashboard usable at 360px.
- No horizontal scrolling.
- Current phase visible near top.
- Tasks readable and tappable.
- Readiness score clear.
- Desktop layout remains usable.

## Closeout Notes

Completed.

## Summary

Sprint 4 refactored the authenticated dashboard into a more mobile-first command center without changing data fetching, phase calculation, task completion, or artifact logic.

Completed:

- Promoted mission snapshot cards near the top of `/app`.
- Promoted recommended objective and workflow health into the first operational section.
- Moved `PhaseObjectives` above the timeline marker strip so mobile users see mission status, readiness score, and objectives earlier.
- Improved mission status card density and tap-friendly CTA behavior.
- Improved readiness score presentation.
- Improved task card checkbox sizing and mobile details button layout.

Deferred:

- Full timeline mobile collapse/expand behavior remains Sprint 5.
- Detailed mobile visual QA remains Sprint 9.
