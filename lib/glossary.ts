// Civilian hiring terms, explained for people hearing them for the first time.
// Rendered by <Term k="..."> as a tap/hover tooltip with a dotted underline.

export const GLOSSARY = {
  ats: "Applicant Tracking System — software that scans resumes for keywords before a human ever sees them. Most companies use one, which is why the right words matter.",
  jd: "Job description — the posting a company writes for an open job: the duties, requirements, and qualifications.",
  keywords: "The specific words from the job posting that screening software and recruiters look for on your resume. Matching them gets you past the first cut.",
  recruiter: "The person who screens applicants first and decides who moves forward — usually before the hiring manager sees anything.",
  "hiring-manager": "The person the job actually reports to. They usually make the final call on who gets hired.",
  "master-resume": "One complete resume with everything you've done. You never send it out — you build targeted resumes from it.",
  "targeted-resume": "A resume trimmed and worded for one specific job posting, so it matches what that company is asking for.",
  headline: "The line under your name on LinkedIn. Recruiters see it in every search result — it matters more than almost anything else on your profile.",
  "about-section": "The short summary at the top of your LinkedIn profile — your story in a few sentences, written for civilians.",
  networking: "Talking to people who work where you want to work. Most jobs are filled through people, not applications.",
  "transferable-skills": "Things you did in the military that civilian jobs also need — leading teams, managing equipment, planning operations.",
  "cover-letter": "A short letter sent with a resume explaining why you fit this specific job. Not always required, but it can set you apart.",
  "gap-analysis": "A side-by-side look at what the job asks for versus what your resume shows, so you know your strong points and weak spots before applying.",
  "informational-interview": "A short, low-pressure conversation with someone doing the job you want — to learn, not to ask for a job.",
  screening: "The first pass over applications, done by software or a recruiter, that decides which resumes a human actually reads.",
} as const;

export type GlossaryKey = keyof typeof GLOSSARY;
