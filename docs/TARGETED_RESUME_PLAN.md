# Targeted Resume Builder Rebuild: Build Plan

The Targeted Resume Builder is rebuilt on the Resume Studio engine, working
from the member's own refined master resume. Every line of a targeted resume
comes from that master, and code checks it. Living document: update the
status board at the end of each phase.

## Decisions on record

| Date | Decision |
|---|---|
| 2026-11-20 | The member's refined master resume is the single source of truth for targeting. The Master Resume Builder gets a member 70 to 80 percent of the way; members download it, refine it in Word, and re-upload it. Resume Studio only works well when it reads that refined version. |
| 2026-11-20 | A modified Resume Studio replaces the Targeted Resume Builder. It ships under the Targeted Resume Builder name, so the Tools hub, Timeline links, and members' habits carry over. The Resume Studio name and page are retired. |
| 2026-11-20 | The Master Resume Builder stays the drafting tool. Improving its first draft (reading every document instead of a 60,000 character sample) is a separate, later decision. |
| 2026-11-20 | The flow: pick the master, see the fit map before anything is written, gaps send the member back to the master, then build a resume checked against the master. |
| 2026-11-20 | Refining the master is the member's confirmation of their facts; no separate confirm step. Any resume text can serve as the master, so members with only a civilian resume, or a pasted one, are covered by design. |
| 2026-11-20 | **The member chooses their master resume.** No MilVector rule picks one; the choice, and the responsibility for it, sits with the member. Every resume tool works from that choice. |
| 2026-11-20 | Phase 2 is judged against Brandon's own Application Package Studio (`D:\sandbox\Projects\Resumes\application-studio`, the design this engine is based on): its inputs and finished resumes for jobs already applied to. |
| 2026-11-20 | Fewer AI calls per resume: three today (title research, posting analysis, writing) become two (fit map, build). Breaking the master into lines is done in code wherever its format allows. |

## Why: what is wrong today

1. **No single master resume.** Each tool picks its own, and most ignore the refined version the member re-uploaded:
   - JD Decoder reads the newest MilVector-generated master first and uses an uploaded master only when none exists.
   - Interview Strategist, with nothing chosen, uses the newest targeted resume, then the generated master. Never an upload.
   - The Targeted builder's list starts on the generated master.
2. **Targeted output is not checked.** A targeted resume can state a figure, credential, or tool the master does not contain, and nothing catches it.
3. **Four steps where two do the job.** Title research mostly repeats the JD Decoder, and the A/B/C checkpoint is a verdict that can live on the fit map.
4. **Resume Studio reads the wrong source.** It rebuilds from raw FITREPs, which members have already improved on in their refined master, and its record cannot be corrected in the app.

## Phase 1: One master resume, chosen by the member

The member picks which resume is their master. MilVector never guesses: a tool
with no choice on file asks for one instead of quietly using something else.

| # | Requirement |
|---|---|
| 1.1 | The choice is stored on the member's profile (new column `profiles.master_resume_ref`, migration 0037), pointing at one uploaded `MASTER_RESUME` document or one saved master resume. |
| 1.2 | One helper in `lib/resume-source.ts` lists what the member can choose from and resolves their choice to text. Each option says where it came from: "uploaded by you" or "written by MilVector", with its date and name. A MilVector master saved both as a record and as a file appears once. Resume Studio's career records are not offered. |
| 1.3 | One picker, shown wherever a tool needs the master: the current choice with its origin and date, a way to change it (saved to the profile, so it changes everywhere), and a link to My Files to upload a refined version. With nothing chosen it says: "Choose which resume is your master. Every resume tool works from it." |
| 1.4 | The picker replaces each tool's own resume list in the Targeted Resume Builder, JD Decoder, Interview Strategist, and LinkedIn Profile Builder. Where a tool takes pasted resume text today, pasting stays as a one-off alternative. |
| 1.5 | No silent fallback. With no master chosen and nothing pasted, a tool asks the member to choose, rather than using the newest saved resume as it does today. |
| 1.6 | The Master Resume Builder's result tells the member the loop: download it, refine it in Word, upload it to My Files, then choose it as your master. |
| 1.7 | Before migration 0037 is run, tools keep working as they do today and the picker says the choice cannot be saved yet. |

**Acceptance:** with several masters on an account, choosing one in any tool makes all four tools use it and say so. Deleting the chosen file returns every tool to "choose your master". Unit tests cover the listing, the de-duplication, and resolving a choice that no longer exists.

## Phase 2: Proof on Brandon's own master (admin only)

Build the engine and run it before building the full screens.

| # | Requirement |
|---|---|
| 2.1 | **Structure the master.** MilVector's own master format (section headings, `Title \| Organization \| dates` lines, `- ` bullets) is parsed in code. Any other format gets one AI call that returns the structure with every line copied word for word, and code confirms each returned line exists in the master, so this step cannot invent anything. Cached by the master's content, so it reruns only when the master changes. |
| 2.2 | Each role and line gets an id (ROLE-01, LINE-01-03), as Resume Studio's record does today. |
| 2.3 | **Fit map.** Requirements split into required and preferred. Each is strong, met, partial, or gap, citing the master lines that cover it. Counts, never a percentage. A verdict (apply, a stretch worth weighing, probably not this one) with a one-sentence reason. Years of experience computed from the master's dates. |
| 2.4 | **Build, checked against the master.** The AI may rephrase and reorder freely. Code then removes, and reports, any bullet that breaks a check: |
| | C1 Every bullet cites at least one master line from the same role. |
| | C2 Every figure in a bullet appears in the lines it cites. |
| | C3 No degree, certification, clearance, or license the master does not list. |
| | C4 No tool, system, or software the master does not mention. |
| | C5 No achievement stated twice. |
| | C6 Roles in reverse chronological order, with titles, organizations, and dates as the master has them. |
| | C7 Fits two pages. |
| | C8 No filler phrases. |
| 2.5 | **The gate rule** (carried over from the Application Package Studio): when a check removes a correct bullet, fix the check's matching. Never loosen or drop the check to make a resume pass. |
| 2.6 | Run on Brandon's chosen master against postings he has already applied to through the Application Package Studio (`application-studio/jobs/`). Compare each result with that job's finished resume from the Application Studio, and with the current Targeted builder's output for the same posting. |

**Gate:** Brandon judges the side-by-side. If the new output does not clearly beat the current builder, the rebuild stops here and the plan is revisited.

## Phase 3: The new Targeted Resume Builder (admin only)

| # | Requirement |
|---|---|
| 3.1 | **Your master.** The Phase 1 picker: the member's chosen master, where it came from, and a way to pick another or paste one. Plain warning: "Every line of your targeted resume comes from this. Refine it first." |
| 3.2 | **The posting.** Job title, company (optional), and the full posting. |
| 3.3 | **Check my fit.** The fit map from 2.3, before anything is written. |
| 3.4 | **Gaps go back to the master.** Each gap says: if you have done this, add it to your master and re-upload it; if not, be ready to speak to it. A button downloads the current master to edit. After re-uploading, the member chooses the new version as their master and runs the fit map again. |
| 3.5 | **Build the resume.** The checked resume, the list of what each check removed and why, and the Word file in the existing template. |
| 3.6 | Phone first: works at 390 and 320 pixels wide. |
| 3.7 | Unit tests for every check (C1 to C8), the master parser, and the line verification in 2.1. A browser walkthrough of the whole flow. |

**Gate:** Brandon walks it on the live site with his own master.

## Phase 4: Cutover

| # | Requirement |
|---|---|
| 4.1 | The Targeted Resume Builder card and the Timeline task links open the new flow for every member. |
| 4.2 | The old four-step flow is removed. Job title research is not carried over; the JD Decoder covers it, and the new tool links to it. |
| 4.3 | The Resume Studio page and its career-record step are retired. Its document batch reader is kept in the code for the later Master Resume Builder decision. |
| 4.4 | What's New entry drafted and held in `docs/whatsnew-pending.md` for Brandon's wording check. |

**Gate:** Brandon approves the What's New wording and the cutover.

## Out of scope

- An in-app editor for the master resume. Members refine in Word and re-upload.
- Changes to how the Master Resume Builder writes its first draft.
- Cover letters and interview packets.

## Open decisions

| # | Question | Leaning |
|---|---|---|
| D2 | JD Decoder already gives a fit read. Should it use the new fit map, so there is one fit answer across the site? | Decide after Phase 2 shows the fit map is good. |
| D3 | The Master Resume Builder's "Legacy Bullets Only" mode. Keep or retire? | Out of this plan; note only. |

## Status board

| Phase | Status |
|---|---|
| Plan | Approved 2026-11-20 with two adjustments: the member chooses their master (no MilVector rule), and Phase 2 is judged against the Application Package Studio's inputs and finished resumes |
| 1 | In progress |
| 2 | Not started |
| 3 | Not started |
| 4 | Not started |
