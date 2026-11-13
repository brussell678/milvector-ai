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
  // Chat version hosted in ChatGPT, shown beside a built-in tool
  gptHref?: string;
  // The tool itself lives in ChatGPT; there is no built-in version yet
  isExternal?: boolean;
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
    description: "Start here. These build the master resume and LinkedIn profile that everything else uses.",
    tools: [
      {
        href: "/app/tools/fitrep-bullets",
        title: "Master Resume Builder",
        desc: "Turn your uploaded military records into one master resume — the base every other tool builds on. Already have a master resume? Skip this and upload yours in My Files instead.",
        requirements: [
          { text: "Records uploaded (FITREPs, EVALs, JST, or VMET)", check: "sources" },
          { text: "Awards, if you have them — upload the Summary of Action to add depth to the billet you held (optional)." },
          { text: "Review the result, polish it, and upload your final version as a Master Resume." },
        ],
        gptHref: "https://chatgpt.com/g/g-69d5982e578c819184c2e96ec1c81bbb-milvector-master-resume-generator",
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
        gptHref: "https://chatgpt.com/g/g-697c169088588191bce63407d421f5b0-milvector-ai-targeted-resume-builder",
      },
      {
        href: "/app/tools/jd-decoder",
        title: "Job Description Decoder",
        desc: "Paste a job posting and see what they really want, what to watch out for, and how well you fit — before you apply.",
      },
      {
        href: "https://chatgpt.com/g/g-69b9fc23c88c81919a3cd53ffcbe1b1a-milvector-ai-interview-strategist",
        title: "Job Interview Strategist",
        desc: "Practice interviews for a real job with feedback. Turn on voice mode for a realistic mock interview.",
        requirements: [
          { text: "Have the job title and full job posting ready." },
          { text: "Know the company name." },
          { text: "Bring the resume you're applying with." },
        ],
        isExternal: true,
      },
    ],
  },
  {
    kicker: "EXPLORE",
    title: "Figure Out What's Next",
    description: "Not sure what civilian job fits? Start here to see your options in plain language.",
    tools: [
      {
        href: "/app/tools/mos-translator",
        title: "MOS Translator",
        desc: "Enter your MOS and see which civilian jobs match your experience — with the words hiring managers use for it.",
      },
    ],
  },
  {
    kicker: "DECIDE",
    title: "Make the Big Calls",
    description: "Support for benefits and retirement decisions with long-term consequences — VA ratings and the Survivor Benefit Plan.",
    tools: [
      {
        href: "https://chatgpt.com/g/g-69b6925c39308191b477586de0b7e6ac-va-c-p-rating-navigator-gpt",
        title: "VA C&P Rating Navigator",
        desc: "Guided disability rating walkthroughs with the VA C&P Rating Navigator GPT.",
        requirements: [{ text: "Bring your claimed conditions, symptoms, and any rating decisions or medical evidence you want to review." }],
        isExternal: true,
      },
      {
        href: "https://chatgpt.com/g/g-69b75fcfb8d881918bd6c8a092bdb899-milvector-ai-military-sbp-decision-advisor",
        title: "Military SBP Decision Advisor",
        desc: "Guided Survivor Benefit Plan decision support with the SBP Decision Advisor GPT.",
        requirements: [{ text: "Have your retirement timing, family situation, and SBP decision factors available before you start." }],
        isExternal: true,
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
};
