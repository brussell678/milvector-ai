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

Not testable in the harness, so it is on Brandon's walk: the reply box staying
above the keyboard on a real iPhone and Android phone, and answers streaming
through Cloudflare on the live site.

## Phase 2: Job Description Decoder (to be revised after Phase 1)

Link or paste on top, with the member's master resume as a chip. The result
arrives in order: the role in plain English, your fit, must-haves and risks,
keywords to copy, interview prep. "Build my resume for this" carries the run
into the resume chat, fit included. Tests: `chat-jd-verify.cjs`, the
same-request check, and `d2-verify.cjs` and `job-link-verify.cjs` stay green.

## Phase 3: Targeted Resume Builder (to be revised after Phase 2)

Master and posting on top. Check fit, then the fit card, then "update your
master first, or build now?". The build shows its progress for its one to two
minutes. The line review runs one card at a time in the thread (Correct, or
Wrong and fix). When every line is done, a file card with Download and "Saved to
My Files". The route and every check are untouched. Tests:
`chat-resume-verify.cjs`; `review-verify.cjs`, `phase4-verify.cjs`, and
`d2-verify.cjs` unchanged and green; no path in the chat reaches the Word file
before every line is checked. D8 decided here.

## Phase 4: VA Rating Navigator (to be revised after Phase 3)

Conditions on top, with the combined rating pinned there. "Talk me through this
one" asks plain factual questions (how often, how long, what treatment), then
runs the existing analysis. A crisis check runs on every message. Nothing the
member says about symptoms is stored on our side. Tests: `chat-va-verify.cjs`,
including the crisis path, no rating outside the schedule ever shown, and no
symptom text in the run log or storage after a session. D9 decided here.

## Phase 5: SBP Decision Advisor (to be revised after Phase 4)

Retired pay, ages, and marital status on top. The rest of today's form is asked
a question or two at a time with tap answers; Skip keeps today's defaults.
What-ifs rerun the math in code at once, with no AI run. Tests:
`chat-sbp-verify.cjs`; figures match today's page to the cent. D10 decided here.

## Phase 6: Rollout

Open each chat to members when Brandon says, with a What's New draft for each;
privacy page wording for anything new that is kept; retire the classic pages
when he decides.

## Status board

| Phase | Status |
|---|---|
| 0. Plan | Done 2026-11-23 |
| 1. Shell and MOS Translator | Built 2026-11-23 on branch `chat-tools`, admin only; waiting on Brandon's phone walk |
| 2. JD Decoder | Not started |
| 3. Targeted Resume Builder | Not started |
| 4. VA Rating Navigator | Not started |
| 5. SBP Decision Advisor | Not started |
| 6. Rollout | Not started |
