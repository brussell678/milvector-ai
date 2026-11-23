# Chat Tools: Build Plan

Five tools move to a chat format: the MOS Translator, the Targeted Resume
Builder, the Job Description Decoder, the VA Rating Navigator, and the SBP
Decision Advisor. The member's inputs sit at the top, and a scrollable chat box
sits underneath, built for a phone first. The end goal of each tool does not
change; the chat is a more familiar way to get there. Living document: update
the status board at the end of each phase.

## Decisions on record

| Date | Decision |
|---|---|
| 2026-11-23 | Inputs at the top, a scrollable and interactive chat box underneath, in all five tools. |
| 2026-11-23 | The MOS Translator goes first (D1). What it teaches shapes the other four, and Phases 2 to 5 are revised before each starts. |
| 2026-11-23 | The reply box sits at the bottom of the chat box and appears to hover over the conversation (D2). |
| 2026-11-23 | My Files is the chat history (D3a): a member saves a chat to My Files as a file. No list of past chats is kept on our side. The open chat survives a refresh on the member's own device. |
| 2026-11-23 | Follow-up questions have their own daily budget, about 100 a day (D4). Tool runs still count against the daily run limit as they do today. |
| 2026-11-23 | A chat downloads as a Word file (D5). |
| 2026-11-23 | Each chat opens to the admin first, behind a switch, with today's page kept for members until Brandon retires it (D6). |
| 2026-11-23 | Follow-up answers stream in word by word (D7). Tool results still arrive as whole cards. |
| 2026-11-23 | Phase 1 is the foundation for the rest; move on to Phase 2. |
| 2026-11-23 | JD Decoder: the role summary and the member's fit show open; requirements, risks, keywords, interview prep, and company signals sit in one card of folds (D12). |
| 2026-11-23 | JD Decoder: a job link or a whole posting pasted into the reply box is spotted by the page (no AI call) and offered as a "Decode this posting" button; nothing runs until it is tapped (D13). |
| 2026-11-23 | Phase 2 looks good live; move on to Phase 3. |
| 2026-11-23 | Targeted Resume: the line review runs one line at a time in the chat, each marked line bringing the next, with a running count (D14). |
| 2026-11-23 | D8 decided: no editing resume wording by chat in this phase. The chat explains and points to the ways that already work (Wrong on a line, updating the master, building again). |
| 2026-11-23 | Targeted Resume: make the review a real lock (D15). Today the Word file is in My Files the moment it is built and only the builder's button waits; from now on a new targeted resume downloads (builder, My Files, the library) or goes on a business card only once every line is marked, and review marks are saved. Older resumes are unaffected. |
| 2026-11-23 | Phase 3 works well enough to move on; tweaks may come once all five are running. The Targeted Resume Builder is the premier tool: outshining paid competitors there matters most. |
| 2026-11-23 | D9 decided: the VA chat is kept only in the open browser tab (it survives a refresh and is gone when the tab closes), downloads as a Word file to the member's own device, and is never saved to My Files. The page's promise that MilVector does not save symptom details stays true as written. |
| 2026-11-23 | VA Navigator: "Talk me through this one" is guided by the page (D16). The chat lists what to cover; the member answers in their own words; Analyze runs today's analysis, whose "what appears to be missing" says what to add next. No extra AI calls and no AI-written questions. |
| 2026-11-23 | Brandon: a retiree claims 25 to 40 conditions, with a handful of questions each, so the shared 100 follow-ups a day runs out and they never get the full picture. Three changes follow (D17, D18, D9 amended). |
| 2026-11-23 | D17: follow-up questions are counted per tool. The VA Rating Navigator allows 300 a day (`CHAT_VA_DAILY_MESSAGE_LIMIT`), each other chat 100 (`CHAT_DAILY_MESSAGE_LIMIT`), so a long VA session never blocks another tool's chat. |
| 2026-11-23 | D18: VA Rating Navigator analyses and code lookups have their own budget, 150 a day (`VA_DAILY_RUN_LIMIT`), apart from the 60 runs the other tools share, so a big claim fits in one sitting and the costly Targeted Resume Builder keeps its tight cap. Applies to the classic VA page too. |
| 2026-11-23 | D9 amended: the VA chat stays in the open tab by default, and the member may switch on "Keep this chat on this device for 30 days", worded so it is clear MilVector still does not save it and anyone using that browser could see it. Switching it off removes the kept copy. No Save to My Files, as before. |
| 2026-11-23 | Phase 4 walked: Brandon likes the VA chat, especially taking conditions one at a time. On to Phase 5. |
| 2026-11-23 | SBP Advisor intake (D19): four essentials on top (marital status, ages, gross retired pay); the chat offers "Ask me quick questions first", mostly one tap each, and every answer fills the More details section on top, where it can be changed. Page-guided, no AI. |
| 2026-11-23 | D10 decided: the SBP chat is kept like the VA chat: the open tab by default, an opt-in "keep on this device for 30 days" switch, Download only, never saved by MilVector; the transcript route refuses a Save for it. |
| Later | D8 (Phase 3) editing a resume by chat, D9 (Phase 4) saving a VA chat, D10 (Phase 5) saving an SBP chat, D11 (Phase 2 on) a typed sentence filling the top inputs. Brandon decides each at its milestone. |

## How the chat works

The chat is a new front end on the existing tools, not a new brain. Every chat
has two kinds of turns.

1. **Tool runs.** The chat calls the tool's existing route with the same
   request the form sends today. The result arrives in the thread as cards.
   The checks, the run log, and the daily run count are the ones the tool
   already has, so the end result cannot drift from today's page, and a test
   proves it by comparing the two requests.
2. **Follow-up questions.** One new endpoint, `/api/chat/[tool]`, answers
   questions about the current result. It is grounded on the member's inputs,
   the latest result, and the last few turns, under each tool's own rules (no
   new figures or claims about the member; later, VA never coaches an answer
   and SBP numbers come only from code). It can suggest what to ask next, and
   it can propose a new run ("Run again with interests: cybersecurity") as a
   button that says it uses one of today's runs. It never runs a tool, spends
   a run, or changes a file without a tap.

What stays the same everywhere: every AI call is logged in `tool_runs`; OpenAI
is told not to store responses, and the chat sends the conversation with each
turn rather than chaining responses; SSN and DoD ID numbers are scrubbed from
what members type before it reaches the model or a saved file.

## Layout

- A compact title instead of the large hero, so the chat is on screen sooner.
  What the tool gives you moves into the first message.
- The inputs card at the top. After a run it shrinks to one line ("0311, 8
  years, Edit") so the thread gets the screen.
- The chat box below scrolls on its own, newest at the bottom. On a phone it
  fills the screen under the menu bar and stays above the keyboard.
- The reply box hovers: rounded, raised with a shadow, the conversation
  scrolling behind it. Suggestion chips sit just above it.
- "Jump to latest" appears when the member has scrolled up. Stop shows while
  something is working. An error keeps everything the member typed.
- The chat bar offers Download (Word), Save to My Files, and New chat.

## Phase 1: Chat shell and the MOS Translator (admin only)

| # | Requirement |
|---|---|
| 1.1 | The chat view of the MOS Translator shows to the admin. `CHAT_TOOLS_PUBLIC` (a comma list of tools, such as `mos`) opens it to members later. Today's page stays one tap away at `?view=classic`, and the classic page links back to the chat for anyone who can see it. |
| 1.2 | The layout above, at phone width and on a desktop. |
| 1.3 | **Translate** posts the same body to `/api/tools/mos-translator` that the form does. The roles and certifications arrive as cards in the thread, each role with Build Resume for this Role, Set as Target Role, and Ask about this role. `?mos=` and `?welcome=1` still fill the MOS, and the first message welcomes a new member the way the page does today. |
| 1.4 | **Follow-ups** go to `/api/chat/mos_translator` and stream. The rules: answer about the member's transition and this result only; never invent the member's experience; no dollar pay figures (point to the BLS Occupational Outlook Handbook, which keeps current pay by occupation); plain text, no em or en dashes. Up to three suggested next questions. It may propose a run with changed inputs, shown as a button naming the cost. Each follow-up is logged in `tool_runs` under the tool's name, marked `_chat`, with no message text stored. |
| 1.5 | **Budgets.** `CHAT_DAILY_MESSAGE_LIMIT` (default 100) follow-ups per member per 24 hours, separate from `AI_DAILY_RUN_LIMIT`. Follow-ups are left out of the run count, out of Recent Activity on the Tools hub, and show as their own row in the admin usage view. The admin is exempt, as today. |
| 1.6 | **Download** renders the chat as a Word file on request; nothing is stored. **Save to My Files** stores the same Word file as a new file type, Saved chat (`CHAT_TRANSCRIPT`, migration 0043). Until 0043 is run, Save says it is not available yet and Download still works. A saved chat does not count as an uploaded record. |
| 1.7 | The open chat is kept in the member's browser for 7 days, under their account, so a refresh or a locked phone does not lose it. New chat clears it. Nothing else new is stored on our side. |
| 1.8 | No What's New entry while it is admin only. One is drafted when it opens to members. |

**Acceptance:**

- Unit tests: splitting a streamed answer from its suggestions, the suggestion
  and proposed-run checks, the prompt rules, the Word transcript (built, read
  back, scrubbed), the follow-up budget, and the admin usage row.
- `chat-mos-verify.cjs` in the private harness, at 390 px and at desktop width,
  against the stand-in database and stand-in OpenAI: no sideways scroll; inputs
  shrink after a run; the reply box stays visible while the thread scrolls
  under it; a streamed answer arrives in pieces; suggestions send; a proposed
  run is a button and nothing runs until it is tapped; Stop; an error keeps
  what was typed; the chat survives a reload; New chat clears it; Download
  returns a Word file with the conversation; Save puts a Saved chat in My Files;
  the budget message; `?mos=` and `?welcome=1`; the classic page still works.
- The chat's request to `/api/tools/mos-translator` matches the form's.
- `cleanup-verify.cjs` (no dashes on any page) and `timeline-links-verify.cjs`
  stay green.
- Brandon's walk on his own phone.

**Phase 1 results (2026-11-23):** 447 unit tests pass (25 new), tsc and eslint
clean, production build clean. `chat-mos-verify.cjs` 52/52, and 7/7 before
0043. Unchanged and green with the app as members see it: `cleanup-verify`
53, `timeline-links-verify` 29, `phase4-verify` 11, `d2-verify` 17,
`review-verify` 15, `signup-verify` 23, `next-step-verify` 26,
`admin-usage-verify` 16. A member gets today's page and a 404 from the
follow-up endpoint; the admin gets the chat.

What the walkthrough caught, for the phases after this one:

- The OpenAI SDK ends an aborted stream quietly instead of throwing, so a
  stopped answer was logged as finished. `streamChat` now checks the signal
  after the stream ends.
- A smooth scroll to the bottom passes through the middle of the thread, and
  the thread read that as the member scrolling up and stopped following the
  answer. Only an upward scroll unpins it now.

**Brandon's first live look (2026-11-23), fixed the same day:**

- The logo replaces "MV" beside MilVector's messages (shared `BotMessage`,
  lifted and ringed in the accent on the dark theme).
- The suggestion chips covered the end of an answer: they arrive as the
  answer finishes, and the thread made room without scrolling to it. The
  thread now follows when the reply area grows.
- Fewer chips after the first answer: the first three come from the page, and
  the model was asked for "up to 3" and can return fewer. It is now asked for
  exactly three, and the page tops up to three from its own list, leaving out
  anything already asked. Each follow-up's log row now records how many
  suggestions the model gave and whether it wrote the mark.
- No model changed between his runs. Answers vary run to run, and each one is
  grounded on that run's translation and the chat so far. The model had begun
  calling the translation "the result"; it is now told to talk about the
  member's inputs and the jobs on their screen. If answers still read thin,
  `CHAT_EFFORT=medium` on Vercel is the next lever (slower first word, a little
  more cost).

Not testable in the harness, so it is on Brandon's walk: the reply box staying
above the keyboard on a real iPhone and Android phone, and answers streaming
through Cloudflare on the live site.

## Phase 2: Job Description Decoder (admin only)

| # | Requirement |
|---|---|
| 2.1 | The chat view of the JD Decoder shows to the admin; `CHAT_TOOLS_PUBLIC` gains `jd` to open it to members. Today's page stays at `?view=classic` and links to the chat for anyone who can see it. |
| 2.2 | **Inputs on top:** the member's master resume as a one-line chip with Change (the existing picker, which saves the choice for every tool), the job link field, and "or paste the posting". After a decode they shrink to one line ("Decoded: Readiness Program Manager at Acme", Edit). |
| 2.3 | **Decode** reads the link first when there is no pasted text, exactly as today, then posts the same body to `/api/tools/jd-decoder` (one shared function builds it for both pages). The fit check runs beside it as today and is saved with the run. |
| 2.4 | **The result (D12):** the role summary (title, level, plain English, mission) and the member's fit (the existing fit view: verdict, each requirement with the master lines behind it, the honest gap hint) show open. Requirements, risks, keywords (with Copy), interview prep, and company signals sit in one card of folds. With no master chosen, the chat says how to get a fit. Below it, "Build a resume for this job" carries the posting and the fit into the Targeted Resume Builder (`?jd=`), as today. |
| 2.5 | **Paste in the reply box (D13):** a link, or a posting of 1,000 characters or more, gets a "Decode this posting" button that names the cost; the page decides, with no AI call, and nothing runs until it is tapped. A short question still goes to the chat. |
| 2.6 | **Follow-ups** go to `/api/chat/jd_decoder`, grounded on the posting, the decode, and the fit with the master lines it cites. Rules beyond Phase 1's: say how the member fits only from the fit and its master lines; for a gap, be honest (how to speak to it, related experience, how to close it) and never suggest claiming it; if they have done it, tell them to add it to their master in My Files and decode again; pay only as the posting states it, else bls.gov/ooh. The model never proposes a run here. Three suggestions to tap, topped up by the page. |
| 2.7 | Download and Save write the decode out in full (summary, fit with each requirement and its master lines, every list) with the conversation. |

**Acceptance:** unit tests for the shared request, spotting a link or posting,
the context sent to the model, the suggestions, the rules, and the transcript.
`chat-jd-verify.cjs` at 390 px and desktop: link-only decode reads the posting
first; the chat's request matches the classic page's; summary and fit open,
the rest folded; no master gives the "how to get a fit" message; the handoff
link carries the run; a link and a long posting pasted in the reply box each
get a Decode button and nothing runs until it is tapped; the model gets the
posting, decode, and fit; Download and Save. `d2-verify.cjs`,
`job-link-verify.cjs`, and `chat-mos-verify.cjs` stay green.

**Phase 2 results (2026-11-23):** 463 unit tests pass (13 new), tsc and eslint
clean, production build clean. `chat-jd-verify.cjs` 35/35 and
`chat-mos-verify.cjs` 54/54 with `CHAT_TOOLS_PUBLIC=mos,jd`. Unchanged and green
with the app as members see it: `d2-verify` 17, `job-link-verify` 18 (one real
Lever posting), `review-verify` 15, `phase4-verify` 11, `cleanup-verify` 53,
`timeline-links-verify` 29, `signup-verify` 23, `next-step-verify` 26. A member
gets today's JD page and a 404 from its follow-up endpoint.

Shared changes this phase, for Phases 3 to 5: the follow-up endpoint takes a
per-tool spec (what context the page sends, and the run the model may propose,
or none); messages the page writes itself (`local`) and postings pasted into
the reply box (`paste`) are never sent to the model as turns; a tool's own
result card can sit inside a chat message (`.chat-fit`); chat list styles no
longer reach into those cards; the budget message no longer names one tool.

## Phase 3: Targeted Resume Builder (admin only)

| # | Requirement |
|---|---|
| 3.1 | The chat view shows to the admin; `CHAT_TOOLS_PUBLIC` gains `resume`. Today's page stays at `?view=classic`. `?title=` (from the MOS Translator), `?jd=` (from the JD Decoder, with its fit, no run spent), and the new `?review=` work in both. |
| 3.2 | **Inputs on top:** the member's master as one line with Change, the corrections waiting to be copied into their Word master, "paste a resume for this one run instead", the job link or the pasted posting, job title, and company. After a fit check they shrink to one line. |
| 3.3 | **Check my fit** posts the same body to `/api/tools/targeted-resume` as the classic page (one shared function builds it for both). The fit card arrives in the thread, then a short message with the gap count and two buttons: Build my resume, and Download my master to edit. |
| 3.4 | **Build** posts the same build body. A progress card covers its one to two minutes. Then the resume: what the checks did and the resume itself in folds, gaps to be ready for, and the empty-profile note when the header has no name. Every check is untouched. |
| 3.5 | **Review, one line at a time (D14):** "Line 3 of 7", the line with its figures in bold and its master line under it, Correct or Wrong (the existing choices: master out of date, the resume says something the master does not, take a summary sentence out). Marking a line brings the next; finished lines stay as one-line notes. When every line is marked, a file card: Download Word File and where it is saved. |
| 3.6 | **The real lock (D15):** a new resume is saved as needing review; Correct is saved through the review route (no AI, no file rebuild); the Word and text downloads of a targeted resume (the builder, My Files, the library) and attaching it to a business card wait until every line is marked. A locked download opens the builder at that resume's review (`?review=<id>`), in the chat or the classic page, with the marks already made. Resumes built before this change are unaffected. The classic page says the file downloads once every line is checked. |
| 3.7 | **Follow-ups** go to `/api/chat/resume_targeter`, grounded on the job, the fit, the built resume, what the checks did, and how many lines are left to check. Rules beyond Phases 1 and 2: never write or rewrite resume lines (D8); to change one, the member uses Wrong on it, updates their master, or builds again; explain a check or a gap honestly. The model never proposes a run. |
| 3.8 | A link or a whole posting pasted into the reply box gets a "Use this posting" button that fills it in at the top. Nothing runs; Check my fit needs the job title too. |
| 3.9 | Download and Save write out the chat, the fit, the resume, and how each line was marked. |

**Acceptance:** unit tests for the shared request, the lock count, a saved
review read back, the context sent to the model, the rules, and the
transcript. `chat-resume-verify.cjs`: fit then build then review one line at a
time; the chat's requests match the classic page's; Correct and both kinds of
Wrong; progress kept across a reload; the file card only after the last line;
the lock: My Files and the library send an unreviewed resume to its review and
serve it after, the card will not take it; `?jd=` shows the decoder's fit with
no run; `?review=` reopens a review in both views. `review-verify.cjs`,
`phase4-verify.cjs`, `d2-verify.cjs`, `card-upgrades-verify.cjs` stay green
(updated only where the lock changes what they expect, each change named).

**Phase 3 results (2026-11-23):** 477 unit tests pass (14 new), tsc and eslint
clean, production build clean. `chat-resume-verify.cjs` 40/40, with
`chat-mos-verify.cjs` 54/54 and `chat-jd-verify.cjs` 35/35, on the app with
`CHAT_TOOLS_PUBLIC=mos,jd,resume`. With the app as members see it:
`review-verify` 16, `d2-verify` 18, `phase4-verify` 11, `card-upgrades-verify`
47, `job-link-verify` 18, `cleanup-verify` 53, `timeline-links-verify` 29,
`signup-verify` 23, `next-step-verify` 26. A member gets today's builder and a
404 from its follow-up endpoint.

Walkthroughs changed for the lock, as the plan allows:
- `d2-verify` downloaded a fresh resume with no review. It now checks the
  resume is locked first (423), marks each line Correct through the review
  route, then downloads it (one check added).
- `review-verify` now waits for the last saved mark before looking for the
  unlocked link, and checks every mark reached the server (one check added).

Found and fixed on the way: each review action reads the saved resume, changes
it, and writes it back, so two quick taps could write over each other's mark
and leave a resume locked with every line marked on screen. A page now sends
its review actions one after another.

What members notice (classic page): Correct is saved; a new resume's Word file,
from the builder, My Files, or the library, downloads only after the review,
and opens the review if tapped early; an unreviewed resume cannot go on a
business card. A What's New entry is drafted for Brandon to publish.

## Phase 4: VA Rating Navigator (admin only)

| # | Requirement |
|---|---|
| 4.1 | The chat view shows to the admin; `CHAT_TOOLS_PUBLIC` gains `va`. Today's page stays at `?view=classic`. |
| 4.2 | **Inputs on top:** the conditions, one per line (up to 60), and Find the Rating Codes. The combined rating estimate stays pinned there, with Show the math, from the ratings the member picks. |
| 4.3 | **Find the codes** posts the same identify body as the classic page, in batches of 20 (one shared function builds it). The conditions land in one compact card: each with its code (a picker when there are several, "by analogy" when rated that way), which side for an arm or leg, a rating picker limited to the schedule's ratings for that code, and "Talk me through this one". |
| 4.4 | **Talk me through this one (D16):** the chat lists what to cover for that condition (how often, how bad, how long it lasts, treatment and medication, tests, how it affects work and daily life) and its exam form. What the member types goes into that condition's description only: it is never sent to the chat model as a turn. Analyze posts the same analyze body as the classic page. The analysis lands as a card: the likely range first, then the criteria level by level, evidence gaps, the exam checklist, what the criteria turn on, exam prep, and possible secondary conditions, in folds. Its "what appears to be missing" is what to add next; Analyze again re-runs it. The rating picker starts at the low end of the range, as today. |
| 4.5 | **Crisis check on every message:** anything the member types (a question, a description, the conditions list) is checked in the page, with no AI, for words of suicide or self-harm. A match shows the Veterans Crisis Line card in the thread at once (call 988 and press 1, text 838255, or chat online). The model is also told to lead with it. The analysis's own crisis note stays. |
| 4.6 | **Follow-ups** go to `/api/chat/va_rating_navigator`, grounded on each condition's code, the ratings the schedule allows for it (worked out on the server from the code, not taken from the page), the rating picked, the side, each analysis, and the combined estimate with its math. Rules: educational only; never tell the member what to say or how to describe a condition to get a higher rating, and never encourage exaggerating; a percentage only if the schedule allows it for that code; estimates are ranges; accredited Veterans Service Officers file for free; confirm current criteria at the eCFR. The model may propose looking up conditions the member names, as a button ("Find the codes for: ..."), which uses one of today's runs; nothing else. |
| 4.7 | **Privacy (D9):** the chat is kept in the open tab only. Download writes a Word copy (the conditions, ratings and math, each analysis, the member's own descriptions, and the conversation) to their device; nothing is stored. There is no Save to My Files, and the transcript route refuses one for this tool. As today, the run log keeps counts and codes, never the condition names or symptom text, and follow-ups keep no text. |
| 4.8 | The read-this notes (educational only, Veterans Service Officers, honesty, 38 CFR source and date) stay, in the first message. |

**Acceptance:** unit tests for the shared bodies, the crisis check, the server's
allowed ratings, the context, the rules, the refused Save, and the transcript.
`chat-va-verify.cjs`: identify in batches with the classic bodies; codes,
sides, and only allowed ratings in the pickers; the combined estimate and its
math; Talk me through this one, then Analyze with the description, and the
description never in a chat turn; the crisis card for a question, a
description, and the conditions list; a proposed lookup is a button; storage
in the tab only (a new tab starts empty), nothing in `localStorage`; no Save
button and a refused Save request; no symptom text in `tool_runs` after the
session; Download; classic parity.

**Phase 4 results (2026-11-23):** 490 unit tests pass (13 new), tsc and eslint
clean, production build clean. `chat-va-verify.cjs` 38/38, with the other chat
walkthroughs (MOS 54, JD 35, resume 40), on the app with
`CHAT_TOOLS_PUBLIC=mos,jd,resume,va`. With the app as members see it: cleanup
53, timeline links 29, sign-up 23, next step 26, review 16, d2 18, phase 4 11,
job links 18, card upgrades 47. A member gets today's VA page and a 404 from
its follow-up endpoint. Members see no change: today's page was moved, not
changed, so no What's New entry.

Found and fixed on the way:
- Once a member had added to a condition's description, nothing but Analyze
  ended it, so a question typed next went into the description instead of
  the chat. The "Added to your description" message now has Done for now and
  says where the next message goes.
- The crisis card first appeared above the words that called for it. It now
  follows them, for a question, a description, and the conditions list.

**Many conditions (D17, D18, D9 amended), built 2026-11-23:** follow-ups
counted per tool (VA 300, others 100); VA analyses and code lookups on their
own 150 a day, with every other tool's runs counted without them, on the chat
and the classic page; the VA chat's "Keep this chat on this device for 30
days" switch (off by default; one copy at a time, so switching off removes the
kept copy). 494 unit tests; `chat-va-verify` 45/45 (adds the switch, a new tab
picking up a kept chat, and both budgets); the other chat walkthroughs and all
nine older walkthroughs green as members see it (`card-upgrades-verify` on a
warm server, below). Members notice D18 on the classic VA page, so a What's New
entry is drafted.

Harness note: `card-upgrades-verify` can count one card visit twice when it
is the first to open a card page on a freshly started dev server (the page
compiles on that visit and reloads). It passes on a warm server; production
does not compile on a visit.

## Phase 5: SBP Decision Advisor (admin only)

| # | Requirement |
|---|---|
| 5.1 | The chat view shows to the admin; `CHAT_TOOLS_PUBLIC` gains `sbp`. Today's page stays at `?view=classic`. |
| 5.2 | **Inputs on top:** marital status, gross monthly retired pay, the member's age at retirement, and the spouse's age. More details holds today's other answers, optional, with today's defaults. The essentials are checked before anything runs. |
| 5.3 | **Quick questions (D19):** the chat offers ten, asked by the page with no AI: eight tap answers (retirement type, reliance, both healths, the four priorities) and two typed amounts (savings, life insurance), each with Skip. Each answer fills More details. |
| 5.4 | **Compare** posts the same body as the classic page (`sbpPayload`, shared), and the route works the figures out with the same shared function (`sbpAnalysisFor`). The figures land in the chat, then the assessment: best fit and snapshot open, the rest folded. The Reserve and Guard or former-spouse warning stays. |
| 5.5 | **What-ifs** (a covered amount, a real term quote) recalculate in the page at once, with no AI and no run. A what-if can be turned into a written assessment, which is one run. The chat may propose a what-if as a button; it never invents an insurance price. |
| 5.6 | **Follow-ups** go to `/api/chat/sbp_advisor`: the server works the figures out from the member's answers itself, never from the page, and the free-text notes are never sent. Rules: use the figures exactly, no invented premiums, taxes high level, no pressure, the one-time election and the spouse's notarized agreement, DIC paid in full, special rules for Reserve and former spouses, free help (retirement services officer, Personal Financial Manager, legal assistance). |
| 5.7 | **Privacy (D10):** as the VA chat: the open tab by default, an opt-in keep-on-this-device switch for 30 days, Download only; the transcript route refuses a Save. |

**Phase 5 results (2026-11-23):** 506 unit tests pass (12 new), tsc and eslint
clean, production build clean. `chat-sbp-verify.cjs` 32/32, and all five chat
walkthroughs green together (SBP 32, VA 45, MOS 54, JD 35, resume 40) on the
app with `CHAT_TOOLS_PUBLIC=mos,jd,resume,va,sbp`. With the app as members see
it, all nine older walkthroughs are green (card upgrades on a warm server), and
the new `sbp-classic-verify.cjs` 8/8 shows today's SBP page unchanged after its
figures and views moved to shared code ($273.00 premium on $4,200, to the
cent). Members see no change, so no What's New entry.

Harness note: the stand-in OpenAI's port is now `FAKE_OPENAI_PORT` (default
54400); Tailscale took 54400 for an outbound connection during this phase.

## Phase 6: Rollout

Open each chat to members when Brandon says, with a What's New draft for each;
privacy page wording for anything new that is kept; retire the classic pages
when he decides.

## Status board

| Phase | Status |
|---|---|
| 0. Plan | Done 2026-11-23 |
| 1. Shell and MOS Translator | Done 2026-11-23: live, admin only (`e2095be`), walked and accepted as the foundation |
| 2. JD Decoder | Done 2026-11-23: live, admin only (`6a9c858`), walked |
| 3. Targeted Resume Builder | Done 2026-11-23: live (`ac73f9a`), chat admin only, review lock for every member; walked |
| 4. VA Rating Navigator | Done 2026-11-23: live, admin only (`9fcb74a`, budgets `5decf5f`); walked |
| 5. SBP Decision Advisor | Built 2026-11-23 on branch `chat-tools`, admin only; waiting on Brandon's walk |
| 6. Rollout | Not started |
