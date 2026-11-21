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
| 3.8 | **Check every figure before you send** (approved 2026-11-20). Every master drifts, and the engine repeats it faithfully, so the member confirms each number at the moment it matters: the build screen lists every figure in the outgoing resume beside the master line it came from, each ticked off before the Word file downloads, with a way to fix the master if one is wrong. |
| 3.9 | **Fill from unused lines** (approved 2026-11-20). When a resume comes in under about 1.8 pages, one request to add bullets from master lines not yet used, then the same checks again. |
| 3.10 | **Selected Projects** (approved 2026-11-20). Sections of the master without dates (projects, selected work) print under their own heading in the Word file, not as jobs with no organization or dates. |
| 3.11 | The structured master is stored on the server (migration 0038, keyed by the master's content), so it is built once per version and never passed through the browser. Before 0038 it is rebuilt on each request. |
| 3.12 | Lives at the Targeted Resume Builder's own address: admins see the new flow, members keep today's until cutover. A switch (TARGETED_RESUME_V2_PUBLIC) opens it to everyone in Phase 4. |

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
| D4 | A figure on the checklist is wrong. How does the member tell MilVector, so the targeted resume and the master both end up right? | Approved 2026-11-20; built 2026-11-21 (see status board). |
| D5 | The Targeted Resume Builder's model. | Decided 2026-11-21 by bake-off: gpt-6.2-sol at medium effort. |
| D6 | Density. MilVector's 11 point template holds about 12 to 18 bullets in two pages against Application Studio's 32 to 35 at 9 point. | Proposed 2026-11-20, awaiting Brandon. |

## Status board

| Phase | Status |
|---|---|
| Plan | Approved 2026-11-20 with two adjustments: the member chooses their master (no MilVector rule), and Phase 2 is judged against the Application Package Studio's inputs and finished resumes |
| 1 | **Built 2026-11-20, awaiting Brandon's gate.** Needs migration 0037 run in the Supabase SQL editor; until then every tool works as it did and the picker says a choice applies on that page only. The member's choice is saved on the profile; one picker (components/tools/master-resume-picker.tsx) sits in the Targeted Resume Builder, JD Decoder, Interview Strategist (when "My master resume" is selected; a targeted resume can still be picked for that job), and LinkedIn Profile Builder. My Files marks "Your master resume" and offers "Make this my master" on ready master resume files. The Master Resume Builder's result lists the refine loop and offers "Use this draft as my master for now". No silent fallback: with no choice, tools ask; a deleted choice is called out. Verified: 266 unit tests (8 new), a 25-check walkthrough against the stand-in database plus a stand-in for OpenAI that records exactly which resume each tool sent, a 5-check run of the before-0037 behavior, 390 and 320 widths, production build clean |
| 2 | **First proof run 2026-11-20: not yet clearly better; one tuning round proposed.** Master: Brandon_Russell_Master_Resume_Baseline.docx (Brandon's choice). Engine built (admin only): lib/resume/master-record.ts (structure verified word for word: 10 roles, 57 lines, 8 credentials, 0 dropped), app/api/tools/resume-studio/master (structure, fit, generate), master titles kept, master summary and highlights back the summary only, and a named-tools check added to C4 (Tableau, Salesforce, Python, and others). Run on Eliza AI Deployment Manager, OpenAI Applied AI Delivery Lead, Gartner Director Analyst against today's builder and the Application Studio finals. New engine: no untraceable figure or tool, no filler, no dashes, caught one wrong figure; but thin (16 to 21 bullets, 1.4 to 1.6 pages), and the structuring dropped the dateless Marine Corps AI Capability and Education section. Today's builder on the same master: also no untraceable figure or tool, richer (22 to 33 bullets), but "Proven track record" in all three summaries, 5 dashes in one, one reworded section title. Application Studio finals are richer than both mainly because their source holds facts the Baseline lacks, and the two disagree on the briefing-time figure (Baseline 35.5 to 2.5 hours; finals 35.5 to 13.5 total, owners 2.5). Work on branch targeted-resume-phase2, not merged |
| 2, round 2 | **Tuning round 2026-11-20 (Brandon approved).** Master corrected for the test as Brandon decided (briefing figure is 35.5 to 13.5 hours total; Application Studio-only facts added in his finals' wording; 11 edits listed for his Word file). Prompt changes only, no check loosened: a headed section without dates is a role; the master is used fully (5 to 7 bullets for the most relevant roles, target two pages); one summary rewrite from the master if a check removes a sentence. Fixed: a one-date role (Executive Officer, 2025) sorted to the bottom. Result: new engine 1.54, 1.73, 1.91 pages; no untraceable figure or tool, no filler, no dashes, master wording and titles kept, the corrected figure carried through. Today's builder on the same master: more bullets (26 to 33), no untraceable figure or tool, but "Proven track record", "thought leader" twice, and 6 dashes. Still open: Battalion Maintenance Officer gets 3 to 5 of its 11 lines; undated project sections render as jobs with no organization or dates (Word template needs a Selected Projects section) |
| 2 gate | Passed 2026-11-20 (Brandon): round 2 output accepted, with the length fix and Selected Projects folded into Phase 3, and the figure checklist added (3.8 to 3.10) |
| 3 | **Built 2026-11-20, awaiting Brandon's gate.** Needs migrations 0037 and 0038 run in the Supabase SQL editor (before 0038 the structure is rebuilt on every request, which works but costs a call). At /app/tools/resume-targeter admins see the rebuilt builder (components/tools/targeted-resume-builder.tsx, app/api/tools/targeted-resume); members keep the classic flow (components/tools/resume-targeter-classic.tsx) until TARGETED_RESUME_V2_PUBLIC=true. Flow: your master (Phase 1 picker, or paste for one run), the job, the fit map first with the master's own lines as evidence and gaps pointing back to the master with a download, then the build: checked against the master, one summary rewrite if a check removes a sentence, one top-up from unused master lines when under 1.8 pages or when a job from the last ten years is skipped (a job held alongside another is not a gap), at most 8 bullets per role and 2 projects, Selected Projects in the Word file, a new trim order that keeps recent jobs deep, a timeline-gap check, and the figure checklist: every figure beside its master line, each ticked before the Word file downloads. Also fixed: the error badge was faint on the light theme site-wide (now 5.1:1 light, 7.1:1 dark). Verified: 294 unit tests, 0038 database checks 10/10, a 24-check walkthrough against the stand-in database and OpenAI stand-in (390 and 320), the Phase 1 walkthrough 25/25 on the classic builder, and real-model runs on Brandon's corrected master for Eliza: last run 1.85 pages, 9 of 9 checks, 7 jobs with the last ten years complete, 4 figures to confirm; production build clean |
| 3, walk 1 | **Brandon's first live walk 2026-11-20 found four things; three fixed, one is a decision.** Fixed: (1) the Word file downloaded blank: the download re-renders from the saved record, and the builder saved it in a different shape (Resume Studio too); the record is now saved in the shape downloads render, and a record in any other shape is served as the file stored at build time, so resumes saved before the fix download whole. (2) Every textarea on the site showed about two lines: the 44px minimum on `.input` was unlayered CSS and outranked each box's own min-h class; it now sits in the components layer. The posting box is 18rem and resizable, with a readout of its size and its last words so the member can see the whole posting went in, a warning past the 30,000 character limit, and a server message that says so. (3) The figure list now says the Word file unlocks once every figure is checked. Also: when the Profile has no name, the build says the Word file's header comes from the Profile and links to it. Verified: 295 unit tests, a 20-check walkthrough of the fixes (Word file contents against every bullet on screen, both download routes, the old-shape fallback, box sizes site-wide, 390 and 320), the Phase 3 walkthrough 24/24, the invitation builder 51/51, production build clean. Open: D4 |
| 3, tailoring | **Tailoring rounds 2026-11-20 (Brandon asked: is it tailoring or copying?).** Measured against the master: the Phase 3 engine copied every bullet word for word (19 of 19 on Eliza; 0 posting words gained). Brandon set the bar: a similar level of tailoring to his Application Package Studio, including ATS optimization, checked against its finished resumes after each round. Thirteen real-model rounds on Eliza, OpenAI, and Gartner. Built: the Application Studio structure (the posting's title, a three-theme tagline, a keyword band in the posting's words, two themed "Selected ... Outcomes" sections, then the career); two-step tailoring (a plan of line ids, then a rewrite of each chosen bullet from one to three lines of one job); code checks on every rewrite (figures, tools, credentials, ownership raised or weakened, reach and rank, "commercial", added posting words, filler) with the master's own line put back on failure; one retry per failed or barely changed bullet, told why; summary sentences that cite their lines and pass the same checks; a verification request that reads each rewrite beside its lines; skipped jobs added before the rewrite; keyword band and tagline themes held to what the master shows. Finding: on gpt-4.1 the rewrite step adds unsupported purposes and outcomes ("to drive adoption", "for commercial clients") in roughly half its rewrites, so strict checks collapse to copying; on gpt-5.5 at default effort the verification flagged 1 to 2 of about 30 rewrites, highlights moved to a median 0.58 to 0.64 similarity, and ATS coverage of the posting's repeated terms reached 37, 48, and 23 percent against Application Studio's 48, 36, and 25. Cost: 3 to 4 minutes and several more calls per build. Low reasoning effort halved the time but invented more. Open: D5 (model), D6 (density) |
| 3, bake-off | **2026-11-21.** Six postings, Brandon's blind labels as the answer key. gpt-6.2-sol at medium: 6/6 built in about a minute (parallel batches), best tailoring (posting wording in 62 bullets, ATS 40% average), about $0.15 a resume. gpt-6.1-terra: most cautious. gpt-5.5: timed out. Brandon marked 68 of 69 bullets supported, including every model-checker flag, so the model verification step is off by default; code checks always run. Past tense on every bullet. JSON mode on every call. Light tools move to gpt-6-luna (won 6 of 9 blind picks, about 15 times cheaper); JD Decoder wording fixed so it lists only stated requirements. Master Resume Builder on his 20 FITREPs: gpt-6.2-sol richest draft (49 bullets, 15 roles, no filler, no figure outside the FITREPs); master splitting on gpt-6-luna (matched gpt-4.1 exactly), so MASTER_STRUCTURE_MODEL is its own setting. Live hotfix 1328e3c: newer models reject temperature. |
| 3, review step (D4) | **Built 2026-11-21 on the branch.** Every line with a figure, or with wording the master does not use, is marked Correct or Wrong before the Word file downloads. Wrong: "my master is out of date" (the member writes the true line; it replaces this one, is kept in master_corrections, migration 0039, applied to every later read of the master by every tool, listed in step 1 to copy into the Word master, and closes itself once an uploaded master says it) or "the resume says something my master doesn't" (the master's own line goes back in; the report is kept for the admin). The Word file is rebuilt on each fix. Verified: 322 unit tests, a 15-check walkthrough at 390 px against the stand-in database and model, production build clean. Needs migration 0039. |
| 3 gate | Passed 2026-11-21: Brandon walked the new builder live as admin (tailoring and the review step). |
| 4 | **Built 2026-11-21, awaiting Brandon's What's New wording and push.** The new builder opens to every member at /app/tools/resume-targeter (the TARGETED_RESUME_V2_PUBLIC switch is gone); links from the MOS Translator (?title=) and the JD Decoder (?jd=, the member's own run only) prefill it; step 2 links the JD Decoder for checking a job first. Removed: the classic four-step flow (components/tools/resume-targeter-classic.tsx, app/api/tools/resume-targeter) and Resume Studio (page now redirects to the builder; its routes, component, tool card, and RESUME_STUDIO_PUBLIC gate). Kept: the record batch reader in lib/resume/build.ts and its settings in lib/resume/studio-access.ts. Verified as a plain member: the review walkthrough 15/15, the cutover checks 10/10, 321 unit tests, production build clean. |
