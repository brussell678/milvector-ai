# 01 Stakeholder Engagement Plan

## Purpose

Define how stakeholders will be identified, engaged, and informed during the mobile-first UI overhaul and authentication upgrade.

## Primary Stakeholders

- Product owner: MilVector AI owner/operator
- Builder: Codex working inside the local Next.js codebase
- End users: transitioning service members
- Admin users: Russell Innovation Group / MilVector administrators
- Infrastructure owners: Supabase, Vercel, Cloudflare account maintainers

## Stakeholder Needs

- Service members need reliable mobile access, especially on restricted networks.
- Admin users need existing moderation, feedback, and library workflows preserved.
- Product owner needs sprint-by-sprint control with low regression risk.
- Technical execution needs small, buildable increments to avoid context-window drift.

## Engagement Rhythm

- Before each sprint: confirm sprint goal and scope.
- During each sprint: report files changed, behavior changed, and blockers.
- After each sprint: run build, summarize acceptance criteria status, and capture follow-ups.

## Decision Rights

- Product owner approves scope changes and sequencing changes.
- Codex can make implementation-level decisions that follow existing patterns and PRD constraints.
- Any destructive data migration, route removal, or auth policy change requires explicit approval.

