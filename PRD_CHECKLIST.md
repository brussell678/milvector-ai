# PRD Closure Checklist - The Next Mission MVP

Source PRD: `The Next Mission PRD.md`

## Objective
- [x] Authenticated web app implemented
- [x] Structured workflow from onboarding to outputs
- [x] Four AI tools implemented and wired

## Target Users
- [x] UX copy and defaults aligned to USMC transitioning members

## Success Metrics (MVP)
- [x] User generated master bullets tracked (`resume_artifacts.artifact_type = master_bullets`)
- [x] User generated targeted resume tracked (`resume_artifacts.artifact_type = targeted_resume`)
- [x] Time-to-first-value metric available per user (`/app/metrics` and `/api/metrics`)
- [ ] Global percentage dashboards across all users not implemented in-app (recommended for admin/service-role analytics layer)
- [ ] Qualitative "Helped me understand what to do next" feedback capture not yet implemented

## Non-Goals (MVP)
- [x] No payments/subscriptions
- [x] No external job board integration
- [x] No advanced analytics dashboarding

## Core User Flows
- [x] A) Onboarding: login + profile + dashboard next step
- [x] B) FITREP/EVAL to bullets: upload -> extract -> tool -> save artifact
- [x] C) MOS Translator: input -> output -> tool run stored
- [x] D) JD Decoder: input -> output -> tool run stored
- [x] E) Resume Targeter: master bullets + JD -> targeted resume -> save artifact

## Data and Storage
- [x] Supabase tables implemented: `profiles`, `documents`, `tool_runs`, `resume_artifacts`
- [x] Supabase Storage bucket `documents` used
- [x] RLS policies enforce per-user access

## Security Requirements (MVP)
- [x] RLS enabled on all user tables
- [x] PDF-only upload check in app API
- [x] PDF-only storage hardening migration added (`0002_security_and_metrics.sql`)
- [x] Size limits enforced server-side and bucket limit configured in migration
- [x] No intentional logging of raw document text in route handlers
- [x] User warning about sensitive data included in tool UX

## Tech Stack
- [x] Next.js (App Router) + TypeScript
- [x] Supabase Auth + Postgres + Storage
- [x] LLM provider behind gateway module (`lib/llm/client.ts`)
- [ ] Tailwind + shadcn/ui: Tailwind in use, shadcn not added (optional in PRD)

## Deliverables
- [x] Running app with auth, onboarding, 4 tools, library page
- [x] SQL schema + RLS provided (`supabase/migrations/0001_init.sql`)
- [x] Environment variables documented (`.env.example`, `README.md`)

## Remaining Recommended Work (Post-MVP Closure)
- Add qualitative feedback capture (thumbs-up/down + free text) after tool outputs
- Add admin-only analytics endpoint for cohort-level percentages
- Add automated tests for key API routes and UI smoke flow

