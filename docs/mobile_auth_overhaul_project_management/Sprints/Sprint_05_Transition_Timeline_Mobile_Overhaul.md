# Sprint 05 Transition Timeline Mobile Overhaul

## Goal

Make the transition timeline readable and useful on mobile.

## Tasks

- Convert timeline into vertical mobile layout.
- Make each phase a collapsible card.
- Emphasize current phase.
- Show tasks as checklist-style objectives.
- Allow milestone details to open clearly.
- Preserve phase calculation logic.
- Run `npm run build`.

## Acceptance Criteria

- Timeline readable on mobile.
- Phase cards collapse and expand correctly.
- Current phase obvious.
- No dense timeline table on mobile.

## Closeout Notes

Completed.

## Summary

Sprint 5 converted the authenticated timeline into a collapsible, mobile-friendly phase board.

Completed:

- Added current phase calculation to `/app/timeline`.
- Passed current phase context into `TimelinePhaseBoard`.
- Converted phase sections into collapsible phase cards.
- Opened the current phase by default.
- Added current phase visual emphasis.
- Added per-phase completion counts and progress bars.
- Reused `TaskCard` so checklist behavior remains consistent with the dashboard.
- Adjusted `TaskDrawer` to behave more like a mobile bottom sheet on small screens.

Deferred:

- Final browser/device viewport QA remains Sprint 9.
- Any deeper timeline data reseeding remains outside this sprint.
