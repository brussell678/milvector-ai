MilVector AI
Transition Timeline Engine Update PRD

Version: 1.0
Product: MilVector AI
Domain: milvector.org

1. Objective

Implement a data-driven transition timeline engine that converts the Excel planning model into a scalable system inside MilVector.

The system must:

Anchor transition planning to EAS (End of Active Service).

Support optional future anchors:

Terminal Leave

PTAD

Retirement Ceremony

Convert spreadsheet milestone logic into structured tasks.

Support:

milestone tasks

supporting tasks

resource links

Automatically calculate due dates and phases.

MilVector becomes a full transition command center, not just a job planning tool.

2. Product Philosophy

MilVector is a Full Transition Planner.

The system must include:

administrative requirements

VA benefits milestones

education planning

employment planning

financial planning

post-retirement follow-ups

Examples include:

TRS completion

Appendix J

VA BDD claim

SkillBridge

Resume creation

Job applications

Example:
The VA Benefits Delivery at Discharge (BDD) program requires filing a disability claim 180–90 days before separation, which aligns directly with milestone scheduling in the timeline.

3. User Inputs
Required Profile Fields
EAS_date
branch
rank
MOS
Optional Profile Fields

These may be entered later to refine the timeline.

terminal_leave_start
ptad_start
retirement_ceremony_date

If optional dates are missing, the system defaults to EAS.

4. Timeline Calculation Logic
Anchor Event Resolution
function resolveEventDate(anchor_event):

if anchor_event == "EAS":
    return EAS

if anchor_event == "TERMINAL":
    return terminal_leave_start ?? EAS

if anchor_event == "PTAD":
    return ptad_start ?? EAS

if anchor_event == "CEREMONY":
    return retirement_ceremony_date ?? EAS
Task Due Date
task_due_date = event_date - days_before_event
5. Transition Phases

Phases are calculated dynamically.

days_until_EAS = EAS - today

Phase ranges:

Phase	Days
24 months	720–540
18 months	540–365
12 months	365–270
9 months	270–180
6 months	180–90
3 months	90–30
Final	30–0
6. Task Types

Tasks derived from the spreadsheet fall into three types.

6.1 Milestone Tasks

Anchor tasks with fixed offsets.

Example:

Attend TRS
anchor_event: EAS
days_before_event: 365
category: Administrative
6.2 Supporting Tasks

Derived from spreadsheet dependency formulas.

Example structure:

Attend TRS
   ├ Register for TRS
   ├ Complete pre-counseling documents
   └ Contact command for scheduling

These do not calculate dates separately.

They inherit milestone timing.

6.3 Informational Items

Rows without meaningful offsets.

These become:

Knowledge Base articles

Library links

They should NOT appear in the dashboard task list.

7. Database Changes
transition_tasks
id
title
description
category
anchor_event
days_before_event
phase
is_milestone
priority
created_at
transition_supporting_tasks
id
task_id
title
description
order_index
library_links
id
title
category
description
url
source
created_at
knowledge_articles
id
title
category
content
related_tasks
created_at
8. Dashboard Behavior

The dashboard should resemble mission planning software.

Terminology:

Mission
Phase
Objectives
Readiness
Vector
Dashboard Components
Mission Status Card

Displays:

Current Phase
Days Until EAS
Readiness Score
Phase Objectives

Shows tasks relevant to the current phase.

Example:

Phase: 12 Month Planning

Objectives

☐ Attend TRS
☐ Create Master Resume
☐ Explore SkillBridge
☐ Begin Networking
Task Detail Drawer

When a user clicks a task:

Show:

description
supporting steps
recommended resources
related AI tools
9. Readiness Score

Each milestone contributes to readiness.

Example weighting:

administrative = 30%
employment = 30%
VA benefits = 20%
financial = 10%
education = 10%

Score =

completed_tasks / total_tasks

Displayed as:

Transition Readiness: 67%
10. Resource Library Integration

When a task is opened:

Automatically show related links.

Example:

Task: Submit BDD Claim

Resources
• VA Disability Claim Portal
• BDD Program Guide
• Required Documents Checklist

Links come from:

library_links
11. Upload Warning

Every document upload interface must display:

Before uploading documents, redact any sensitive personal information such as SSN, full date of birth, or home address.
12. Admin Task Seeder

Create a script to load tasks from structured JSON.

Example:

scripts/seed-transition-tasks.ts

Input:

data/milvector_transition_tasks.json
13. Frontend Components

New components required:

/components/dashboard/MissionStatus.tsx
/components/dashboard/PhaseObjectives.tsx
/components/dashboard/TaskCard.tsx
/components/dashboard/TaskDrawer.tsx
/components/dashboard/ReadinessScore.tsx
14. Performance Requirements

Dashboard must:

load < 1 second

support 50k+ users

use cached Supabase queries

15. Security

Apply Supabase RLS policies:

users can only read their own profile
users can only read tasks
users can only write feedback
16. Future Enhancements

Not required for this release:

AI career advisor
SkillBridge matching
recruiter access
transition analytics
17. Success Criteria

MilVector must allow a user to:

Enter EAS

Immediately see a mission timeline

Understand what to do next

Track readiness toward transition