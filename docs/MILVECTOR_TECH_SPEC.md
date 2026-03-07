# MilVector AI — Technical Implementation Specification

## Version
1.0

## Purpose

This document defines the **technical architecture, file structure, database schema, and API endpoints** required to implement the MilVector AI platform described in the Product Requirements Document.

This specification is intended for automated development tools (such as Codex) and human developers.

---

# Tech Stack

## Frontend

Framework:
Next.js (App Router)

Language:
TypeScript

Styling:
Tailwind CSS

Deployment:
Vercel

---

## Backend

API Layer:
Next.js Route Handlers

Database:
Supabase (PostgreSQL)

Authentication:
Supabase Auth (Magic Link)

File Storage:
Supabase Storage

---

## Infrastructure

Deployment pipeline:


GitHub → Vercel → Cloudflare DNS


---

# Project Folder Structure

The project must follow this structure.


app/
page.tsx
layout.tsx

dashboard/
page.tsx

tools/
page.tsx
fitrep-resume/
page.tsx
mos-translator/
page.tsx
jd-decoder/
page.tsx
resume-target/
page.tsx

knowledge-base/
page.tsx

library/
page.tsx

feedback/
page.tsx

donate/
page.tsx

api/
feedback/
route.ts
library/
route.ts
tools/
route.ts

components/
Dashboard/
Timeline/
Tasks/
Tools/
Library/
Feedback/
Donate/

lib/
supabase/
ai/
timeline/
utils/

styles/


---

# Key Pages

## Home Page

File:


app/page.tsx


Sections:

Hero
How It Works
Example Transformation
Mission Statement
Call To Action

---

## Dashboard Page

File:


app/dashboard/page.tsx


Purpose:

Display the user's transition timeline.

Components:


DashboardMission
TransitionTimeline
CurrentPhase
TaskList
ReadinessScore


---

# Dashboard Timeline Logic

## Input

User profile includes:


eas_date


---

## Calculation


months_until_EAS =
(eas_date - current_date)


---

## Timeline Phases


24 months
18 months
12 months
9 months
6 months
3 months
0 months


---

## Example Logic


if months_until_EAS > 18
phase = Planning

if months_until_EAS <= 18 && > 12
phase = Positioning

if months_until_EAS <= 12 && > 6
phase = Preparation

if months_until_EAS <= 6
phase = Application


---

# Tools Pages

## Tools Index


app/tools/page.tsx


Displays available tools:


FITREP Resume Generator
MOS Translator
Job Description Decoder
Resume Targeting Engine


---

## Tool Example


app/tools/fitrep-resume/page.tsx


Workflow:

1 Upload document
2 Extract text
3 Send to AI service
4 Return civilian resume bullets

---

# Knowledge Base Page

File:


app/knowledge-base/page.tsx


Displays articles grouped by category.

Categories:


Transition Planning
Military Translation
VA Benefits
Education
Employment
Entrepreneurship


---

# Library Page

File:


app/library/page.tsx


Displays:

Documents
Useful Links

---

# Feedback Page

File:


app/feedback/page.tsx


Form fields:


name
email
branch
mos
feedback_type
message
suggested_tool
attachment


Submit via:


POST /api/feedback


---

# Donate Page

File:


app/donate/page.tsx


Displays QR codes for:


Venmo
CashApp
PayPal


---

# Database Schema

## Profiles


profiles


Fields:


id
branch
mos
rank
eas_date
created_at
updated_at


---

## Feedback


feedback


Fields:


id
created_at
email
branch
mos
feedback_type
message
suggested_tool
attachment_url
status


---

## Knowledge Articles


knowledge_articles


Fields:


id
title
category
content
created_at


---

## Library Documents


library_documents


Fields:


id
title
description
category
file_url
uploaded_by
approved
created_at


---

## Library Links


library_links


Fields:


id
title
description
category
url
created_at


---

## Library Submissions


library_submissions


Fields:


id
title
description
category
file_url
submitted_by
approved
created_at


---

# API Endpoints

## Submit Feedback


POST /api/feedback


Payload:


{
name,
email,
branch,
mos,
feedback_type,
message,
suggested_tool
}


---

## Submit Library Document


POST /api/library/submit


Payload:


title
description
category
file


---

# AI Service Layer

Location:


lib/ai/


Functions:


generateResumeFromFitrep()
translateMOS()
decodeJobDescription()
targetResumeToJob()


---

# Security Requirements

All upload interfaces must display warning:


Before uploading documents, redact any sensitive personal information such as SSN, full date of birth, or home address.


---

# Environment Variables


NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
AI_API_KEY
MAX_UPLOAD_MB


---

# Deployment

Deployment remains unchanged.


GitHub
↓
Vercel
↓
Cloudflare DNS


---

# Future Enhancements

Not part of current implementation.


Career Vector Map
AI Knowledge Base Search
SkillBridge Matching Tool
Salary Comparison Engine
Transition Readiness Index


---

# Development Rules

Codex must follow these rules.

1 Do not create files outside the defined structure.
2 All APIs must live in `/app/api`.
3 Database schema changes must be defined explicitly.
4 UI components must be reusable.
5 Do not expose secrets in client code.

---

# End of Technical Specification