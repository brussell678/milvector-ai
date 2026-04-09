import Link from "next/link";

type ToolCard = {
  href: string;
  title: string;
  desc: string;
  requirements?: string[];
  gptHref?: string;
};

const foundationTools: ToolCard[] = [
  {
    href: "/app/tools/fitrep-bullets",
    title: "MilVector AI Master Resume Generator",
    desc: "Turn uploaded military records into a reusable civilian career foundation for applications, LinkedIn positioning, and planning.",
    requirements: ["Upload source records such as FITREPs, EVALs, JST, or VMET.", "Review the output and save the strongest version to your Library."],
    gptHref: "https://chatgpt.com/g/g-69d5982e578c819184c2e96ec1c81bbb-milvector-master-resume-generator",
  },
  {
    href: "/app/tools/linkedin-builder",
    title: "MilVector AI LinkedIn Profile Builder",
    desc: "Turn a master resume into a stronger LinkedIn presence with career-path suggestions, profile sections, networking guidance, and banner support.",
    requirements: ["Have a saved or pasted master resume available.", "Be ready to select target role, industry, and location strategy.", "Use this when you want positioning and networking support, not just resume output."],
  },
];

const applicationTools: ToolCard[] = [
  {
    href: "/app/tools/resume-targeter",
    title: "MilVector AI Targeted Resume Engine",
    desc: "Generate a role-specific resume and supporting application output from your career foundation plus a real job description.",
    requirements: ["Have a saved master resume in your Library.", "Complete and save your Profile.", "Paste the full target job posting before generating output."],
    gptHref: "https://chatgpt.com/g/g-697c169088588191bce63407d421f5b0-milvector-ai-targeted-resume-builder",
  },
  {
    href: "/app/tools/jd-decoder",
    title: "Job Description Decoder",
    desc: "Break a job posting into requirements, signals, decision points, and interview focus areas before you apply.",
  },
  {
    href: "https://chatgpt.com/g/g-69b9fc23c88c81919a3cd53ffcbe1b1a-milvector-ai-interview-strategist",
    title: "MilVector AI Job Interview Strategist",
    desc: "Prepare for interviews with structured role, company, and resume-based practice and feedback. For mock interviews, turn on voice mode to maximize realism.",
    requirements: ["Bring the specific job title and full job description.", "Have the company name available.", "Provide the resume you want the interview prep based on."],
  },
];

const translationTools: ToolCard[] = [
  {
    href: "/app/tools/mos-translator",
    title: "MOS Translator",
    desc: "Map MOS experience to civilian roles, language, and next-step career pathways.",
  },
];

const decisionTools: ToolCard[] = [
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
];

function ToolGrid({ title, description, tools }: { title: string; description: string; tools: ToolCard[] }) {
  return (
    <section className="section-card">
      <h2 className="section-title">{title}</h2>
      <p className="section-description">{description}</p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {tools.map((tool) => (
          <article key={`${tool.title}-${tool.href}`} className="subtle-panel p-5">
            <h3 className="text-lg font-bold">{tool.title}</h3>
            <p className="mt-1 text-sm text-[var(--muted)]">{tool.desc}</p>
            {tool.requirements?.length ? (
              <div className="mt-4 rounded-md border border-[var(--line)] bg-[var(--surface)] p-3">
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
                  Open Tool
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
  );
}

export default function ToolsPage() {
  return (
    <main className="page-shell">
      <section className="page-hero">
        <div className="page-hero-grid">
          <div className="relative z-10">
            <p className="page-kicker">TOOLSET</p>
            <h1 className="page-title">Use MilVector as a guided transition workflow, not a pile of disconnected tools.</h1>
            <p className="page-description">
              Start with your foundation, move into applications, then use support and decision tools as needed. The goal is to keep your work connected from first record upload through final outputs.
            </p>
          </div>
          <aside className="page-hero-aside">
            <p className="page-hero-aside-title">RECOMMENDED FLOW</p>
            <ul className="page-hero-list">
              <li>Translate and organize your source material first</li>
              <li>Build your career foundation before targeting roles</li>
              <li>Move into job-specific application and interview tools next</li>
              <li>Use decision tools when a major life or benefits choice is on the table</li>
            </ul>
          </aside>
        </div>
      </section>

      <section className="section-card">
        <h2 className="section-title">How To Choose Between Integrated Tools And GPT Links</h2>
        <p className="section-description">Both are useful, but they serve different purposes in the MilVector system.</p>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <article className="subtle-panel p-5">
            <p className="text-xs font-semibold tracking-[0.18em] text-[var(--accent)]">INTEGRATED MILVECTOR TOOLS</p>
            <p className="mt-2 text-sm text-[var(--muted)]">
              These run inside MilVector using our paid API-backed workflow so outputs can stay connected to your profile, documents, library, and export path.
            </p>
            <ul className="mt-3 space-y-2 text-sm text-[var(--muted)]">
              <li>- Best when you want saved outputs, structured workflows, and cleaner exportable document handling.</li>
              <li>- Strongest choice when continuity inside the MilVector workspace matters.</li>
              <li>- These runs create real platform cost on the MilVector side.</li>
            </ul>
          </article>
          <article className="subtle-panel p-5">
            <p className="text-xs font-semibold tracking-[0.18em] text-[var(--accent)]">GPT LINKS</p>
            <p className="mt-2 text-sm text-[var(--muted)]">
              These open custom GPTs in your own ChatGPT account. For many users, the final interaction can feel more robust because the conversation lives directly in ChatGPT.
            </p>
            <ul className="mt-3 space-y-2 text-sm text-[var(--muted)]">
              <li>- Best when you want a more conversational back-and-forth inside ChatGPT.</li>
              <li>- Uses your ChatGPT account rather than MilVector&apos;s API budget.</li>
              <li>- Does not automatically save work into MilVector documents, library, or export flows.</li>
            </ul>
          </article>
        </div>
      </section>

      <ToolGrid
        title="1. Build Your Foundation"
        description="Start here if you want the strongest overall system behavior. These tools create the baseline material that supports later workflows."
        tools={foundationTools}
      />

      <ToolGrid
        title="2. Apply With Precision"
        description="Use these when you have a real job target, want role-specific application materials, or need stronger interview preparation."
        tools={applicationTools}
      />

      <ToolGrid
        title="3. Translate And Explore"
        description="Use these when you are still clarifying target roles, civilian language, or the shape of your next move."
        tools={translationTools}
      />

      <ToolGrid
        title="4. Evaluate Major Decisions"
        description="These tools support benefits and retirement-related choices that have longer-term consequences."
        tools={decisionTools}
      />
    </main>
  );
}
