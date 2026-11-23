# What's New — MilVector

<!--
HOW THIS WORKS
Add a new entry at the TOP of the list below, then commit + push to main.
A GitHub Action publishes any new entries to the live "What's New" feed and the
announcement bar. You never open the website.

FORMAT (one entry):
  ## <Title> {category} [{requested}]
  <body — one or more lines, in plain language for a transitioning service member>

  - category is one of: new | improvement | fix     (default: improvement)
  - add {requested} if a user asked for it           (shows the "Requested by a user" badge)
  - add {draft} to hold it for Brandon: it lands on the admin portal (/app/admin
    and /app/admin/updates) unpublished, where he can edit the wording, publish,
    or delete it. Members see nothing until he publishes.
  - only entries new in each push are added, and titles already in the table are
    skipped, so a draft deleted or retitled on the portal stays that way

WRITE FOR THE USER, NOT THE CODE. This feed is read by transitioning service
members — describe what changed and why it helps them, not the implementation.

For an update that resolves a specific in-app support ticket (and should email
that reporter), use the admin composer at /app/admin/updates instead — it can
link the case. This file is for the general changelog.
-->

## The Retirement Pay Calculator opens inside your workspace {improvement} {draft}
When you are signed in, the calculator now opens in your workspace with your usual menus, and the buttons at the bottom take you to the SBP Decision Advisor and the VA Rating Navigator instead of offering you an account you already have.

## See a far-off retirement estimate in today's dollars {improvement} {draft}
If your retired pay starts years from now, the Retirement Pay Calculator shows your monthly income in today's dollars, using today's pay table, VA rates, and tax brackets, so you can weigh it against your budget now. The future-years table shows the same income in the dollars of each year. It also makes clear that your years in the Retired Reserve count toward your pay.

## Reserve and Guard retirement estimates follow DFAS more closely {improvement} {draft}
In the Retirement Pay Calculator, Reserve and Guard members now pick the month their retired pay starts, usually the month they turn 60, and the High-3 comes from the 36 months before it, the way DFAS figures it. You can add months to your years of service, plan a start date up to 30 years out, and see your points turned into years the way DFAS rounds them. If you chose RCSBP Option B or C, it also reminds you of the extra premium DFAS takes.

## Saved contacts lead back to your card {improvement} {draft}
When someone saves your contact from your digital business card, your card's link now sits at the top of their contact, labeled Digital card, with a note saying the day they saved it. After a career fair full of scans, they can find you and get back to your card in one tap, and when they do, your Insights show it as a Saved contact visit, so you know they are following up.

## Your business card gets a banner, a video call background, and printed cards {new} {draft}
Your digital business card can now carry a banner across the top. Use the banner you made in the LinkedIn Builder with one tap, or upload any image; LinkedIn's 1584 x 396 size fits exactly. From the Share tab, download a video call background and a phone lock screen that carry your QR code, and print paper cards ten to a sheet or as a file for a print shop. At a career fair, turn on event mode so everyone who shares their details is tagged with the event, add your own notes to each contact, and get a follow-up email drafted for you to edit and send.

## Your High-3 now uses the real pay table for every month {improvement}
Your High-3 is the average of your last 36 months of basic pay, and those months usually cross three or four pay years and two or three longevity steps. The Retirement Pay Calculator now takes each month from that year's DFAS pay table, at the step you had reached that month, to the cent. It also applies the legal cap on O-6 pay over 30 years in 2026, which it had shown about $85 a month too high. A month in a year whose table is not out yet, like 2027, uses the raise you choose and says so.

## Travel and schedule no longer count against your fit {improvement}
When the JD Decoder or the Targeted Resume Builder checks your fit, conditions of the job, like travel, relocation, schedule, or a background check, now show as things to confirm instead of gaps. They no longer turn a good fit into a pass.

## Short postings no longer blank the page {fix}
Pasting a job posting that was too short, or a form entry the tool couldn't use, could leave the page blank. Now it tells you what to fix.

## Your home screen flags your VA claim and SBP deadlines {improvement}
As your date gets close, Do this next on your home screen now points you to your VA claim while its pre-discharge window is open, and to your SBP decision before you retire. Once one is done, check it off on your Timeline and the next step takes its place.

## VGLI and spouse FSGLI tasks corrected {fix}
The VGLI task now has the current rule: apply within 240 days after you separate and you skip the health questions (it said 120). The spouse FSGLI task now says plainly that coverage can be converted within 120 days after you separate.

## Delete your account any time {new}
You can now delete your MilVector account yourself, from your Profile. It permanently removes your files, resumes, tool history, and everything else in your account. Download anything you want to keep from My Files first.

## Every MilVector tool on one page {new}
Anyone can now see all 11 tools and what each one does at milvector.org/tools, before making an account. Share it with a fellow service member getting ready to transition.

## Sign in and pick up where you were {improvement}
If you open a MilVector link while signed out, like a Timeline task or a job you decoded, you now land on that page after signing in instead of the home screen.

## Timeline tasks open the tool that does them {improvement}
Eleven more Timeline tasks now have a button to the MilVector tool for that job, like the SBP Decision Advisor on your SBP election and the VA Rating Navigator on your VA claim. The VA claim task also moved to the 9-month phase, so you see it before its 180 to 90 day filing window opens.

## JD Decoder and the resume builder now agree on your fit {improvement}
The JD Decoder now checks your fit the same way the Targeted Resume Builder does: each requirement in the posting, matched to the lines in your master resume that prove it. When you go on to build the resume, it starts from that same fit, so you skip a step and get one answer. Checking your fit adds up to a minute.

## Targeted resumes fit more of your experience {improvement}
Your targeted resume now uses 10 point type, so two pages hold about 22 to 25 bullets instead of 12 to 18. More of your career makes it onto the page, tailored to the job.

## A clear message when your session ends {fix}
If your sign-in expired while you were using a tool, you got a vague error. Now it tells you to sign in again and try once more.

## Text boxes show what you paste {fix}
Boxes for pasting a job posting, a resume, or notes showed only about two lines, so you could not tell whether everything went in. They now open at their full size, and you can drag the corner to make them bigger.

## Error messages are easy to read again {fix}
In the light theme, error messages across MilVector, from sign-in to the tools, showed pale pink text on a pale pink box. They now use the same dark text as everything else, so you can read what went wrong.

## Timeline documents open again {fix}
The ceremony checklist, planning checklist, and Appendix J buttons on Timeline tasks led to a page not found. They now open the document, and the button says which one it is.

## Targeted Resume Builder, rebuilt {improvement}
It now shows how you fit a job before writing anything, then tailors your resume to the posting using only what your master resume says. Before the Word file downloads, you check every figure and any new wording, and a fix you make carries into every resume after.

## Master Resume Builder writes a fuller first draft {improvement}
Your first master resume now pulls more from your evaluations: more roles, more accomplishments, and no filler phrases. It takes about two minutes to build.

## JD Decoder separates must-haves from nice-to-haves {improvement}
The JD Decoder now lists exactly what a posting requires and keeps preferred qualifications apart, so you can tell what's truly needed before you decide to apply.

## Digital Business Card {new}
Build a business card you never run out of. Share it with a link, a QR code, or a tap, keep it in Apple Wallet or Google Wallet, and let the people you meet send their details straight back to you. Find it under Tools.

## Retirement Invitation Builder {new}
Build one page for your retirement ceremony and the celebration after it, free. Guests RSVP on their phone, get base pass steps and directions, and the same link and QR code turn into the program on the day and a thank-you page afterward. Find it under Tools, or from the ceremony tasks on your Timeline.

## Retirement Pay Calculator {new}
See your full monthly income after retirement in one place: retired pay under High-3 or BRS, VA disability compensation with dependents, what CRDP or CRSC adds back, your SBP premium, and an estimate of taxes. It is free, needs no account, and nothing you enter is saved.

## Interview Strategist, VA Rating Navigator, and SBP Advisor now run inside MilVector {new}
These three tools used to open in ChatGPT, which is retiring that feature in December. They are now built in, so you no longer need a ChatGPT account. The Interview Strategist uses your saved resume and runs a spoken mock interview with feedback. The VA Rating Navigator works from the actual rating regulation and estimates your combined rating. The SBP Advisor shows what each option costs and pays using your own numbers.

## Privacy update: analytics on public pages {improvement}
MilVector now counts visits to its public pages, like the home page and knowledge base, so we can see how service members find it. Nothing inside your signed-in workspace is tracked, and your records, documents, and tool use are never sent to analytics. Details are on the Privacy page.

## Add your awards to your Master Resume {new} {requested}
You can now upload an award Summary of Action (or citation) and the Master Resume Builder folds its scope and impact into the right role — without double-counting what your FITREPs already cover. Upload the Summary of Action if you have it; the citation works too.

## Job Description Decoder now reads your real fit {improvement}
If you have a master resume saved, the Decoder now compares the posting against your actual background and gives you an honest fit read — where you match, the real gaps, and a straight go / stretch / not-worth-it recommendation. No master resume yet? It will tell you, and you can build one first.

## An honest review on every targeted resume {improvement}
Targeted resumes now come with a candid "read before you send" review that tells you where the resume is weak and how to strengthen it. The tools will never invent a clearance, degree, or metric to match a posting — your record stays true to your record.

## Larger screenshots on support requests {fix}
Attaching a screenshot or file to a support case now works reliably, including larger images, so it is easier to show us exactly what you are seeing.
