# 11 Change Management Plan

## Purpose

Control changes to scope, design direction, and implementation sequencing.

## Change Types

- Scope addition
- Scope deferral
- Technical approach change
- Supabase schema change
- Route or navigation change
- Copy or terminology change

## Change Rules

- Keep sprint changes within the active sprint goal.
- Record deferred work in the backlog.
- Do not combine auth, dashboard, timeline, and tool refactors in one pass.
- Any schema migration must be additive and documented.

## Approval

Product owner approval is required for:

- Destructive migrations
- Route removals
- Auth provider changes
- New vendor dependencies
- Major visual redesign beyond the PRD

