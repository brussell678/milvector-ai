// Single source of truth for the Tools hub. The page renders from this, so
// adding, retiring, or moving a tool is a data change here, not a page edit.

export type Requirement = {
  text: string;
  // When set, the bullet becomes a live check against workspace state
  check?: "sources" | "master" | "profile";
};

export type ChecksState = {
  sources: boolean;
  master: boolean;
  profile: boolean;
};

export type ToolCard = {
  href: string;
  title: string;
  desc: string;
  requirements?: Requirement[];
  // Chat version hosted outside MilVector, shown beside a built-in tool
  gptHref?: string;
  // The tool lives outside MilVector; there is no built-in version
  isExternal?: boolean;
  // A calculator that runs in the browser: no AI run, nothing logged
  isCalculator?: boolean;
  // Builds a page the member publishes (a card, an invitation): no AI run,
  // nothing logged
  isBuilder?: boolean;
  // Shown only to members with preview access (see lib/tools/preview.ts)
  isPreview?: boolean;
};

export type ToolGroupDef = {
  kicker: string;
  title: string;
  description: string;
  tools: ToolCard[];
};

export const toolGroups: ToolGroupDef[] = [
  {
    kicker: "STEP 1 + 2",
    title: "Build Your Base",
    description:
      "Start here. Not sure what to aim for? The MOS Translator shows which civilian jobs fit. Then build the master resume and LinkedIn profile that everything else uses.",
    tools: [
      {
        href: "/app/tools/mos-translator",
        title: "MOS Translator",
        desc: "Enter your MOS and see which civilian jobs match your experience, in the words hiring managers use. Pick one as your target role and the resume builders aim at it.",
      },
      {
        href: "/app/tools/fitrep-bullets",
        title: "Master Resume Builder",
        desc: "Turn your uploaded military records into one master resume — the base every other tool builds on. Already have a master resume? Skip this and upload yours in My Files instead.",
        requirements: [
          { text: "Records uploaded (FITREPs, EVALs, JST, or VMET)", check: "sources" },
          { text: "Awards, if you have them — upload the Summary of Action to add depth to the billet you held (optional)." },
          { text: "Review the result, polish it, and upload your final version as a Master Resume." },
        ],
      },
      {
        href: "/app/tools/resume-studio",
        title: "Resume Studio (Preview)",
        desc: "The next version of the resume builders. Reads every record you uploaded, traces each accomplishment to its source, and checks every bullet and figure in your resume against it.",
        requirements: [{ text: "Records uploaded (FITREPs, EVALs, awards, JST, or VMET)", check: "sources" }],
        isPreview: true,
      },
      {
        href: "/app/tools/linkedin-builder",
        title: "LinkedIn Profile Builder",
        desc: "Turn your master resume into a complete LinkedIn profile — headline, sections, career suggestions, and a banner.",
        requirements: [
          { text: "Master resume saved (or be ready to paste one)", check: "master" },
          { text: "Know roughly what role and industry you want." },
        ],
      },
      {
        href: "/app/tools/business-card",
        title: "Digital Business Card",
        desc: "A card you share with a tap, a link, or a QR code. Add it to Apple or Google Wallet, let people send their details back, and see how often it is viewed.",
        requirements: [{ text: "The contact details you want a recruiter or new connection to have." }],
        isBuilder: true,
      },
    ],
  },
  {
    kicker: "STEP 3",
    title: "Go After Real Jobs",
    description: "Use these when you've found a job you want — to understand the posting, build the resume, and prep for the interview.",
    tools: [
      {
        href: "/app/tools/resume-targeter",
        title: "Targeted Resume Builder",
        desc: "Build a resume aimed at one specific job, using your master resume plus the real job posting.",
        requirements: [
          { text: "Master resume saved", check: "master" },
          { text: "Profile saved — your contact info goes on the resume", check: "profile" },
          { text: "Copy the full job posting so you can paste it in." },
        ],
      },
      {
        href: "/app/tools/jd-decoder",
        title: "Job Description Decoder",
        desc: "Paste a job posting and see what they really want, what to watch out for, and how well you fit — before you apply.",
      },
      {
        href: "/app/tools/interview-strategist",
        title: "Interview Strategist",
        desc: "Prepare for one real interview: what the hiring manager cares about, likely questions with answers from your record, then a spoken mock interview with feedback.",
        requirements: [
          { text: "A resume saved (or be ready to paste the one you applied with)", check: "master" },
          { text: "Copy the full job posting so you can paste it in." },
          { text: "Know the company name." },
        ],
      },
    ],
  },
  {
    kicker: "DECIDE",
    title: "Make the Big Calls",
    description: "Support for benefits and retirement decisions with long-term consequences: your retirement income, VA ratings, and the Survivor Benefit Plan.",
    tools: [
      {
        href: "/retirement-calculator",
        title: "Retirement Pay Calculator",
        desc: "See your full monthly income after retirement: retired pay, VA disability, CRDP or CRSC, SBP, and taxes together. Runs in your browser and saves nothing.",
        requirements: [{ text: "Your pay grade and years of service at retirement, or your High-3 if you know it." }],
        isCalculator: true,
      },
      {
        href: "/app/tools/va-rating-navigator",
        title: "VA Rating Navigator",
        desc: "See how VA would rate each condition you plan to claim: the criteria from the regulation, an exam checklist, your evidence gaps, and an estimated combined rating.",
        requirements: [{ text: "Know the conditions you plan to claim, and how each one affects you day to day." }],
      },
      {
        href: "/app/tools/sbp-advisor",
        title: "SBP Decision Advisor",
        desc: "Compare the Survivor Benefit Plan with life insurance using your real numbers, and see which approach fits your family before you sign.",
        requirements: [{ text: "Your estimated monthly retired pay, your age, and your spouse's age." }, { text: "A term life quote, if you have one (optional)." }],
      },
      {
        href: "/app/tools/retirement-invitation",
        title: "Retirement Invitation Builder",
        desc: "One page for your retirement ceremony and the celebration after it. Share it with a link or one QR code, and guests get the times, places, dress, and directions on their phone.",
        requirements: [{ text: "Your ceremony date, time, and place, plus any reception or party details." }],
        isBuilder: true,
      },
    ],
  },
];

// Display names for tool_runs.tool_name values.
export const toolLabels: Record<string, string> = {
  fitrep_bullets: "Master Resume Builder",
  mos_translator: "MOS Translator",
  jd_decoder: "Job Description Decoder",
  resume_targeter: "Targeted Resume Builder",
  linkedin_builder: "LinkedIn Profile Builder",
  interview_strategist: "Interview Strategist",
  va_rating_navigator: "VA Rating Navigator",
  sbp_advisor: "SBP Decision Advisor",
};

/** A tool's name for a link to it, such as a Timeline task's button. */
export function toolTitleFor(href: string): string | null {
  const path = href.split(/[?#]/)[0];
  const card = toolGroups.flatMap((group) => group.tools).find((tool) => tool.href === path);
  return card ? card.title.replace(/\s*\(Preview\)$/, "") : null;
}
