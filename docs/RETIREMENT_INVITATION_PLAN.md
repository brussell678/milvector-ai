# Retirement Invitation Builder: Build Plan

Status document. Opened 2026-11-19. Owner gate between every phase.
Model: Brandon's own retirement site (Russell-Innovation-Group/retirement and
its RETIREMENT_BUILD_PLAN.md), rebuilt as a free tool any retiring member can use.

---

## Decisions on record

| Date | Decision |
|---|---|
| 2026-11-19 | Name: **Retirement Invitation Builder** |
| 2026-11-19 | Retirement only. Not promotions, changes of command, or reenlistments |
| 2026-11-19 | Guest photo upload and gallery come later, not in the first release |
| 2026-11-19 | Admin-only preview first, like the Digital Business Card. Opened by env `RETIREMENT_INVITE_PUBLIC=true` |
| 2026-11-19 | Guest page lives at `milvector.org/r/<name>` |
| 2026-11-19 | Tools hub: DECIDE group ("Make the Big Calls") |
| 2026-11-19 | The hooks into the rest of MilVector must be laid out for the member (profile, Timeline, templates) |
| 2026-11-19 | **MilVector sends no email for this tool.** The Resend account belongs to Brandon's Russell Innovation Group contact address. Confirmations happen on screen; reminders go out from the host's own email or phone |
| 2026-11-19 | Guest data is deleted 180 days after the ceremony, with a warning to the host two weeks before |
| 2026-11-19 | The ceremony plus up to two more events per invitation |
| 2026-11-19 | Meal choices are optional and off by default. Many hosts just order catering. When on, the host names up to six and guests give counts |
| 2026-11-19 | Design control approved: MilVector-designed **templates** the member picks from, an accent color, a cover photo plus up to 12 career photos, section toggles. No drag-and-drop. No co-editing |

---

## What it is

One page per retirement. The retiree builds it in the workspace and shares it by
link or one QR code. Guests RSVP without an account. The page changes with the
calendar: an invitation before the day, the program on the day, a thank-you
afterward. The retiree sees headcounts, meals, base pass status, and messages,
and can send reminders.

What no competitor does, and this does: the base access pipeline, one QR code
for the whole lifecycle, a military program with stand cues, and the guests'
messages to the retiree. All free, no ads.

---

## Ground rules

1. **Never collect SSN or date of birth.** Some installations ask for them on
   event access lists. MilVector collects legal names only. The host sends
   names to the base and the base contacts guests directly.
2. **Mobile first.** Most guests open this on a phone, and every QR scan is a
   phone. Design and check at 320 and 390 wide before desktop.
3. **Private by default.** The guest page is kept out of search and analytics
   and carries no site menus, like a business card. A private street address is
   shown only to guests who RSVP yes to that event.
4. **Code decides, the AI only drafts.** When AI help arrives (later), it drafts
   wording from the member's own record. It never invents a billet, award, or
   date.
5. **No email from MilVector.** Nothing in this tool calls Resend. Anything a
   guest needs to keep is on the confirmation screen, and the host messages
   guests from their own email or phone.
6. **No em dashes** in anything a guest or host reads.

---

## The builder: what the host fills in

A guided flow with the stage bar the other tools use. Everything saves as a
draft until the host publishes.

### Step 1. The basics
- Retiree name and rank, branch. **Filled in from the profile.**
- Ceremony date. **Filled in from the profile's retirement ceremony date**, and
  saved back to the profile if the host changes it, so the Timeline stays right.
- Page address (`/r/russell-retirement`), suggested from the name.
- Welcome line under the name (a default is provided; the host edits it).
- Cover photo, optional. Shrunk in the browser before upload, which also strips
  location data.

### Step 2. The events
- The ceremony, plus up to two more (reception, party, dinner).
- Each event: name, date, start and end time, place name, address, dress
  (military and civilian), notes (food, drink, parking).
- Each address can be marked **"share only after RSVP"** for a private home.
- An **"aboard an installation"** switch turns on Step 3 for that event.
- A calendar file per event is built automatically, plus an "Add to Google
  Calendar" link, because Android phones do not reliably open calendar files.
  A private address is never put in either.

### Step 3. Base access (only when an event is aboard an installation)
- Plain-language instructions: which gate, when to leave, what to bring, where
  to collect a pass.
- Two dates: **RSVP by this date if you need a pass** (the host sets it earlier
  than the base's real cutoff, as a buffer) and the general RSVP date.
- The pass steps every guest who needs one moves through:
  RSVP received, names sent to the base, guest finished the base's form, pass
  in hand.
- A fixed note on the form: "MilVector never asks for Social Security numbers
  or dates of birth. If the base needs them, it will contact you directly."

### Step 4. The RSVP form
- Yes, maybe, or no for each event (on by default).
- Adults and children counted separately.
- Meal choices, **off by default**. When the host turns them on, they name up
  to six and guests give a count of each.
- Allergies and dietary needs as free text, on by default and separate from
  meal choices, because an allergy matters even with a catered buffet.
- "Does everyone in your party hold a DoD ID?" and, if not, legal names for
  passes. Only when Step 3 is on.
- A message to the retiree, optional, on by default. Warning shown to guests
  that it may be read aloud.
- Mobile number, optional.

### Step 5. The program
- Sequence of events, prefilled with a standard retirement order (posting of
  colors, anthem, invocation, orders and awards, remarks, flag presentation,
  retiree remarks, retiring of colors). The host edits, reorders, adds.
- A stand cue per item ("Please stand", "Remain standing").
- Key personnel: role, name, and one line each.
- Bios for the retiree and officials: a short version and an optional full
  version that expands.
- Live stream link, optional. The player loads only when tapped, so phones in
  the audience never play ceremony audio back into the microphone.

### Step 6. Guest information
- The day's schedule, built from the events plus any extra items.
- Up to six information blocks (title and text): lodging, getting there,
  parking, what to expect. Links allowed.
- Contact email for questions.

### Step 7. Share
- Preview as a guest on a phone-sized frame, then publish.
- QR code in navy and black, SVG and PNG, with the printing rules from
  Brandon's print pack (minimum one inch, keep the border, test two phones).
- The short link, a copy button, and ready-to-paste invitation text for email
  and text messages.

---

## The guest page (`/r/<name>`)

Order before the day: cover and date, the events, base access (when on), RSVP,
schedule, key personnel, guest information, program, stream, share, a small
MilVector credit. A sticky RSVP bar on phones.

**Lifecycle**, decided by the visitor's own clock, with a host override:

| When | What leads | RSVP form becomes |
|---|---|---|
| Until the ceremony day | Invitation and RSVP | RSVP |
| Ceremony day until 0600 the next morning | Program, stream, where to be | Messages only |
| Afterward | Thank-you in past tense, the program as a record | Messages only |

Nothing is ever hidden. Only the order and wording change, so a code scanned at
the wrong time never dead-ends.

**RSVP behavior**
- Submitting again with the same email replaces the earlier answer. The host's
  list marks it as changed and keeps the previous answer visible.
- **The confirmation screen does the job a confirmation email would.** It
  shows every private address the guest is now entitled to, the calendar files,
  and, for pass guests, what happens next with the base and by when.
- It offers **"Email this to myself"**, which opens the guest's own email app
  with the details filled in, so they keep a copy without MilVector sending
  anything.
- It gives the guest a **personal link to come back and change the RSVP**.
- Spam guards from the business card: a hidden honeypot field and a daily cap
  per page.

**Kept out of sight:** a noindex tag (as on business cards; blocking `/r/` in
robots.txt would stop search engines from ever reading that tag), no Google
Analytics, no site menus. Link previews in text messages still work.

---

## The host's dashboard (a "Guests" tab in the builder)

- Headcount per event, adults and children.
- Meal totals and a list of every allergy, ready for the caterer.
- Everyone, with a filter, add-by-hand, and a CSV download.
- **Base passes:** every guest who needs one, three tick boxes each, and buttons
  to copy the email list and the names for the base.
- **Messages:** all of them, with "copy all" for writing the speech.
- **Reminders, sent by the host:** pick a group (attending, maybe, declined but
  still invited, pass not finished), write a note, and MilVector prepares it.
  The host gets a ready message with the link, a "copy addresses for BCC"
  button, an "open in my email app" button, and a "copy phone numbers" button
  for a group text. A "mark as sent" button records who was reminded and when.
- **New RSVPs** show as a count on the Guests tab ("3 new since your last
  visit"). No email notice.
- Override for what the page is showing (Automatic is the default).

---

## Data and privacy

**One additive migration** (nothing existing changes), on the business card
pattern:

- `retirement_invites`: owner, address, page content (JSON, validated on every
  save), private addresses kept in their own column, photo, published,
  suspended.
- `retirement_invite_guests`: one row per guest email per invite, answers per
  event, counts, meals, dietary, message, DoD ID answer, pass names, the three
  pass ticks, last reminded.
- The public page never reads the tables. It goes through database functions
  that return one published invite by exact address (no listing or scraping),
  never return private addresses, and accept an RSVP only for a live page
  under its daily cap.
- `tool_runs` is untouched: this tool makes no AI calls in the first release.

**Limits:** one invite per member (it is one retirement), up to 500 guests.

**Guest data belongs to non-members**, so:
- The Privacy page gets a section saying what is collected from guests, who
  sees it (the host only), and when it is deleted.
- Retention: guest data is deleted 180 days after the ceremony. The host is
  warned two weeks before, in the workspace, and can download the CSV first.
- The host can delete any guest or the whole invite at any time.

**OPSEC:** the card's checks run on every text field: Social Security and DoD ID
numbers are a hard stop; clearance levels, deployments, and street addresses in
public text get a warning.

---

## Hooks into the rest of MilVector

| Where | What the member sees |
|---|---|
| Profile | Ceremony date, name, and rank fill in the builder. A changed ceremony date saves back |
| Timeline task "Identify ceremony attendee list - send out e-Invite" (150 days out) | Opens the builder |
| Timeline task "Identify key individuals for retirement ceremony" | Opens the builder at the program step |
| Timeline tasks "Design retirement brochure" and "Finalize ceremony sequence of events" | Open the builder at the program step |
| Timeline task "Finalize speech" | Opens the Messages tab |
| Resource Library | The builder links to the existing ceremony checklist, LOI, program samples, and flag certificate templates for the unit-side paperwork |
| Tools hub | "Retirement Invitation Builder (Preview)" in DECIDE, visible to the admin until opened |

Timeline links are set in `data/milvector_transition_tasks.json`
(`assistance_type: "tool"`). Confirm during the build that the database copy of
those tasks picks them up.

---

## Build order

| Phase | Scope | Gate |
|---|---|---|
| A | Migration, page content schema, builder Steps 1, 2, 7; templates, accent color, and cover photo; guest page invitation view without RSVP; publish and preview; QR and calendar files; the admin-only Tools hub card (the way in) | Brandon builds a page on his phone and reviews it as a guest |
| B | Steps 3 and 4; RSVP and the confirmation screen; Guests tab with counts, meals, list, CSV, base pass board | Test RSVPs through every path, including the pass path, on a phone |
| C | Steps 5 and 6; career photos; section toggles; lifecycle views and override; stream; messages; reminders | Dry run of all three views on two phones |
| D | Timeline and Library hooks; Privacy page; What's New entry held in docs/whatsnew-pending.md | Brandon walks the whole flow live, then decides on opening it |

**Later:** guest photo upload and gallery; AI drafts of the welcome line and the
retiree's bio from their own record; a printable program; a formatted
invitation the host pastes into their own email (like Brandon's
invitation.html); a link-preview image built per invite.

---

## Open decisions

None at the moment.

---

## Look and photos (approved 2026-11-19)

MilVector designs the templates; the host picks one and fills it in. Every
combination stays readable on a phone. No free-form drag-and-drop page editing:
that is how pages break on phones, and it is a website builder, not a tool.

- **Photos:** a cover photo, plus up to 12 more of the retiree's career
  with optional captions (the "Along the way" strip). Each is shrunk in the browser before upload (about
  300KB), which also strips location data. Stored in the database (migration
  0034) and served only for a published page, or to the host in preview. On the
  page every photo is trimmed to the same shape from the bottom first, so a
  portrait keeps the face; a tap opens the whole photo.
- **Templates:** three at launch: a dark navy and brass look like Brandon's own
  page, a white formal look, and a field look in olive and sand. Switching
  templates never loses content.
- **Accent color:** branch colors offered as presets (colors only; no official
  emblems, which carry trademark rules) or any color the host picks.
- **Sections:** turn optional sections on or off and reorder the information
  blocks.
- **A photo note:** leave out current operations, sensitive equipment, and
  faces of people who have not agreed to be on a public page.

---

## Status board

| Phase | Status |
|---|---|
| Plan | Approved 2026-11-19 |
| A | **Built 2026-11-19, awaiting Brandon's gate.** Needs migration 0031 run in the Supabase SQL editor first. Verified: 29 database access checks (in-memory Postgres), 25 unit tests, and a 39-check browser walkthrough against a stand-in database (create, events, private address, cover photo, publish, all three templates as a guest at 390 and 320 wide, calendar file, desktop editor). Not yet seen against the real database or on a real phone |
| A gate | Passed 2026-11-19. Brandon's findings fixed: meaningless color dots on the QR buttons, cramped icon buttons site-wide, cropped cover photo in the Look tab |
| B | **Built 2026-11-19, awaiting Brandon's gate.** Needs migration 0032 run in the Supabase SQL editor first. Verified: 57 database checks for 0032 (in-memory Postgres), 43 unit tests for the feature, and a 35-check browser walkthrough against a stand-in database running the REAL migrations (host setup, two guests on phones at 390 and 320, personal link, pass ticks, spreadsheet, add by hand). Not yet seen against the real database or on a real phone |
| B follow-up | Brandon's findings fixed 2026-11-19: Base step 1 names the email the base writes to; passes are for adults only; each adult gives their own email (migration 0033) |
| C | **Built 2026-11-19, awaiting Brandon's gate.** Needs migration 0034 run in the Supabase SQL editor first (0033 before it). Builder gains Program and Info tabs; Look gains career photos and section toggles; Share gains the before/on/after setting and thank-you line; Guests gains reminders (sent from the host's own email, with "Mark as sent") and messages left on the day. The guest page changes by the venue's calendar: invitation before, program first on the day, thank-you after; `?view=invite`, `eventday`, or `memories` shows any of them. Verified: 27 database checks for 0034 (with 0031 to 0033 rerun: 29, 57, 15), 224 unit tests (22 new), a 62-check browser walkthrough against a stand-in database running the REAL migrations (all three views at 390 and 320, photo upload, reorder, captions, stream tap to play, day message and its honeypot, the calendar switching the page by itself, reminders and mark as sent), Phase A and B walkthroughs rerun (39 and 39), production build clean. Not yet seen against the real database or on a real phone |
| D | Not started |
