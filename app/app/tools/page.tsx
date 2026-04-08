import Link from "next/link";

type ToolCard = {
  href: string;
  title: string;
  desc: string;
  requirements?: string[];
  gptHref?: string;
};

const coreTools: ToolCard[] = [
  {
    href: "/app/tools/fitrep-bullets",
    title: "MilVector AI Master Resume Generator",
    desc: "Turn uploaded military records into a reusable civilian career foundation for applications and planning.",
    requirements: ["Upload source records such as FITREPs, EVALs, JST, or VMET.", "Review the output and save the strongest version to your Library."],
    gptHref: "https://chatgpt.com/g/g-69d5982e578c819184c2e96ec1c81bbb-milvector-master-resume-generator",
  },
  {
    href: "/app/tools/resume-targeter",
    title: "MilVector AI Targeted Resume Engine",
    desc: "Generate a role-specific resume and supporting application output from your career foundation + job description.",
    requirements: ["Have a saved master resume in your Library.", "Complete and save your Profile.", "Paste the full target job posting before generating output."],
    gptHref: "https://chatgpt.com/g/g-697c169088588191bce63407d421f5b0-milvector-ai-targeted-resume-builder",
  },
  {
    href: "/app/tools/linkedin-builder",
    title: "MilVector AI LinkedIn Profile Builder",
    desc: "Turn a master resume into a stronger LinkedIn presence with career-path suggestions, profile sections, networking guidance, and banner-prompt support.",
    requirements: ["Have a saved or pasted master resume available.", "Be ready to select target role, industry, and location strategy.", "Use this tool when you want positioning and networking support, not just resume output."],
  },
  {
    href: "https://chatgpt.com/g/g-69b6925c39308191b477586de0b7e6ac-va-c-p-rating-navigator-gpt",
    title: "MilVector AI VA C&P Rating Navigator GPT",
    desc: "Open the VA C&P Rating Navigator GPT for guided disability rating walkthroughs.",
    requirements: ["Bring your claimed conditions, symptoms, and any rating decisions or medical evidence you want to review."],
  },
  {
    href: "https://chatgpt.com/g/g-69b75fcfb8d881918bd6c8a092bdb899-milvector-ai-military-sbp-decision-advisor",
    title: "MilVector AI Military SBP Decision Advisor",
    desc: "Open the Military SBP Decision Advisor for guided Survivor Benefit Plan decision support.",
    requirements: ["Have your retirement timing, family situation, and SBP decision factors available before you start."],
  },
  {
    href: "https://chatgpt.com/g/g-69b9fc23c88c81919a3cd53ffcbe1b1a-milvector-ai-interview-strategist",
    title: "MilVector AI Job Interview Strategist",
    desc: "Prepare for interviews with structured role, company, and resume-based practice and feedback. For mock interviews, turn on voice mode to maximize realism.",
    requirements: ["Bring the specific job title and full job description.", "Have the company name available.", "Provide the resume you want the interview prep based on."],
  },
];

const basicTools: ToolCard[] = [
  {
    href: "/app/tools/mos-translator",
    title: "MOS Translator",
    desc: "Map MOS experience to civilian roles, language, and next-step career pathways.",
  },
  {
    href: "/app/tools/jd-decoder",
    title: "Job Description Decoder",
    desc: "Break a job posting into requirements, signals, decision points, and interview focus areas.",
  },
];

export default function ToolsPage() {
  return (
    <main className="page-shell">
      <section className="page-hero">
        <div className="page-hero-grid">
          <div className="relative z-10">
            <p className="page-kicker">TOOLSET</p>
            <h1 className="page-title">Use MilVector tools as a connected transition system.</h1>
            <p className="page-description">
              Move from source records and planning to applications, decisions, and interview preparation without losing continuity between steps.
            </p>
          </div>
          <aside className="page-hero-aside">
            <p className="page-hero-aside-title">START STRONG</p>
            <ul className="page-hero-list">
              <li>Build your career foundation first.</li>
              <li>Complete your profile before targeted workflows.</li>
              <li>Check each tool&apos;s requirements before starting.</li>
            </ul>
          </aside>
        </div>
      </section>

      <section className="section-card">
        <h2 className="section-title">Core Tools</h2>
        <p className="section-description">
          MilVector core workflows for military-to-civilian transition support, including career translation, applications, and decision tools.
        </p>
        <p className="mt-3 text-sm text-[var(--muted)]">
          Each core tool has specific requirements. Check them before you start so you get the strongest output on the first pass.
        </p>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <article className="subtle-panel p-5">
            <p className="text-xs font-semibold tracking-[0.18em] text-[var(--accent)]">INTEGRATED MILVECTOR TOOLS</p>
            <p className="mt-2 text-sm text-[var(--muted)]">
              These run inside MilVector using our paid API-backed workflow. Your inputs and outputs move through the platform so results can connect to your profile, documents, library, and export flows.
            </p>
            <ul className="mt-3 space-y-2 text-sm text-[var(--muted)]">
              <li>- Best when you want saved outputs and cleaner exportable Word-document workflows.</li>
              <li>- Useful when you want work to stay connected to the MilVector system.</li>
              <li>- These tool runs create real usage cost on the MilVector side.</li>
            </ul>
          </article>
          <article className="subtle-panel p-5">
            <p className="text-xs font-semibold tracking-[0.18em] text-[var(--accent)]">GPT LINKS</p>
            <p className="mt-2 text-sm text-[var(--muted)]">
              These open custom GPTs in your own ChatGPT account instead of using the integrated MilVector workflow. For many users, the final output can feel more robust because the interaction is happening directly in ChatGPT.
            </p>
            <ul className="mt-3 space-y-2 text-sm text-[var(--muted)]">
              <li>- Best when you want a more conversational back-and-forth inside ChatGPT.</li>
              <li>- Uses your ChatGPT account rather than MilVector&apos;s paid API calls.</li>
              <li>- Does not automatically save work into MilVector documents, library, or export flows.</li>
            </ul>
          </article>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {coreTools.map((tool) => (
            <article key={tool.href} className="subtle-panel p-5">
              <h3 className="text-lg font-bold">{tool.title}</h3>
              <p className="mt-1 text-sm text-[var(--muted)]">{tool.desc}</p>
              {tool.requirements && tool.requirements.length > 0 ? (
                <div className="mt-4 rounded-md border border-[var(--line)] bg-[var(--surface-2)] p-3">
                  <p className="text-xs font-semibold tracking-wide text-[var(--muted)]">REQUIREMENTS</p>
                  <ul className="mt-2 space-y-2 text-sm text-[var(--muted)]">
                    {tool.requirements.map((requirement) => (
                      <li key={requirement}>- {requirement}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-2">
                {tool.href.startsWith("http") ? (
                  <a href={tool.href} className="btn btn-secondary inline-flex" target="_blank" rel="noreferrer">
                    GPT Link
                  </a>
                ) : (
                  <Link href={tool.href} className="btn btn-secondary inline-flex">
                    Open
                  </Link>
                )}
                {tool.gptHref ? (
                  <a href={tool.gptHref} className="btn btn-secondary inline-flex" target="_blank" rel="noreferrer">
                    GPT Link
                  </a>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="section-card">
        <h2 className="section-title">Basic Tools</h2>
        <p className="section-description">Supporting tools for role analysis, translation, and transition planning.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {basicTools.map((tool) => (
            <article key={tool.href} className="subtle-panel p-5">
              <h3 className="text-lg font-bold">{tool.title}</h3>
              <p className="mt-1 text-sm text-[var(--muted)]">{tool.desc}</p>
              <Link href={tool.href} className="btn btn-secondary mt-4 inline-flex">
                Open
              </Link>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
