# MilVector AI — Product Requirements Document (PRD)

## Version
1.0

## Author
MilVector Project

## Overview

MilVector AI is a career navigation platform designed to help transitioning service members translate their military experience into successful civilian careers.

The platform combines:

- AI-powered career tools
- transition planning timelines
- a structured knowledge base
- community feedback
- curated transition resources

MilVector AI functions as a **career vector mapping system** that guides users from active service to civilian employment.

---

# Branding

## Platform Name
MilVector AI

## Domain
milvector.org

## Legacy Domain
the-next-mission.org → redirect to milvector.org

---

## Tagline

Primary tagline:


Find the vector to your next career.


Secondary tagline:


AI career navigation for service members.


---

# Product Pillars

MilVector AI consists of five major components:

1. AI Tools
2. Transition Timeline Dashboard
3. Military Transition Knowledge Base
4. Feedback System
5. Donation System

---

# Navigation Structure

Primary navigation menu:


Home
Dashboard
Tools
Knowledge Base
Library
Feedback
Donate


---

# Home Page Requirements

## Purpose

Improve:

- trust
- clarity
- conversion

---

## Hero Section

Headline:


MilVector AI
Find the vector to your next career.


Subheading:


AI tools designed to help service members translate their military experience into civilian careers.


Primary CTA:


Start Free


Secondary CTA:


Learn How It Works


---

## How It Works Section

Display the workflow.

Example:


1 Upload your military records
2 Build your master resume
3 Target resumes to real job postings
4 Navigate your transition timeline


---

## Example Transformation

Show a real example of military → civilian translation.

Military bullet:


Led 24 Marines maintaining a 100 vehicle fleet with 96% readiness.


Civilian bullet:


Managed a 24-person operations team responsible for fleet sustainment of 100 vehicles while maintaining 96% operational readiness.


---

## Mission Section

Explain the purpose of the platform.

Example:


MilVector AI was created to help service members translate their military experience into civilian careers.

Built by Marines for service members.


---

# Dashboard

## Concept

The dashboard acts as a **transition planning board** similar to a TEEP or POA&M.

Users provide:


End of Active Service (EAS)


The system calculates:


months_until_EAS


---

# Dashboard Layout

Top section:


MISSION

Translate your military experience into a civilian career before your EAS date.


---

## Transition Timeline

Phases displayed visually:


24 Months
18 Months
12 Months
9 Months
6 Months
3 Months
0 Months


The user's current position in the timeline should be highlighted.

---

## Current Phase Panel

Example:


Current Phase: Positioning
14 months until EAS


---

## Task List

Tasks associated with each phase.

Example tasks:


Build master resume
Translate MOS
Begin networking
Explore SkillBridge


Each task should link to either:

- a tool
- a knowledge base article

---

## Progress Tracking

Display readiness percentage.

Example:


Transition Readiness: 45%


Progress is calculated based on completed tasks.

---

# Database Changes

## Profiles Table

Add field:


eas_date


Schema:

profiles

id
branch
mos
rank
eas_date
created_at
updated_at


---

# Transition Tasks Table

transition_tasks

id
phase_month
title
description
tool_link
knowledge_article


Example record:


phase_month = 12
title = Build Master Resume
tool_link = /tools/fitrep-resume


---

# AI Tools

Existing tools remain unchanged but branding must be updated to MilVector AI.

Tools:


FITREP Resume Generator
MOS Translator
Job Description Decoder
Resume Targeting Engine


---

# Knowledge Base

The knowledge base should be structured like a field manual rather than a document dump.

---

## Knowledge Base Categories


Transition Planning
Military to Civilian Translation
VA Benefits
Education
Employment
Entrepreneurship


---

## Knowledge Articles Table

knowledge_articles

id
title
category
content
created_at


---

# Library Page

The library contains both **documents** and **useful links**.

---

## Documents Table

library_documents

id
title
description
category
file_url
uploaded_by
approved
created_at


---

## Links Table

library_links

id
title
description
category
url
created_at


Examples:


GI Bill Comparison Tool
SkillBridge Program
ClearanceJobs
VA Benefits Portal


---

# Library Document Submission

Users can submit documents for inclusion in the library.

All submissions require admin approval.

---

## Submission Form Fields


Title
Description
Category
File Upload


---

## Submission Table

library_submissions

id
title
description
category
file_url
submitted_by
approved
created_at


---

# Feedback Page

The feedback page collects platform suggestions and bug reports.

---

## Form Fields


Name (optional)
Email (optional)
Branch
MOS
Feedback Type
Message
Suggested Tool
File Upload


---

## Feedback Table

feedback

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

# Donation Page

The donation page allows users to support the platform.

Initial implementation uses QR code payments.

Supported platforms:


Venmo
CashApp
PayPal


Page content example:


Support MilVector AI

If this platform helped your transition, consider supporting the project.
MilVector AI is a community-supported project.


---

# Upload Warning

All document upload areas must include a warning message.


Before uploading documents, redact any sensitive personal information such as SSN, full date of birth, or home address.

Black out or remove this information before submitting documents.


---

# Admin Tools

For MVP, admin access will be handled through the Supabase dashboard.

Future admin routes may include:


/admin/feedback
/admin/library


---

# UX Design Principles

The platform should feel like **mission planning software**, not a typical job site.

Preferred terminology:


Mission
Phase
Objectives
Readiness
Vector


---

# Deployment

Deployment pipeline remains:


GitHub → Vercel → Cloudflare DNS


No infrastructure changes required.

---

# Success Criteria

The platform should allow users to:

- understand their position in the transition timeline
- build resumes quickly
- access transition resources
- submit feedback
- support the project

---

# Future Enhancements (Not in Scope)

These features are not part of the current update but should be considered in architecture.


AI knowledge base search
career vector visualization
SkillBridge matching system
salary analysis tool
transition readiness scoring


---

# Summary

MilVector AI evolves the platform from a resume tool into a full **career navigation system for transitioning service members**.

The platform combines:


AI Tools
Transition Planning
Knowledge Base
Community Feedback
Resource Library


to guide users toward successful civilian careers.