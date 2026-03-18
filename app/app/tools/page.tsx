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
    title: "Master Resume Generator",
    desc: "Turn uploaded military records into a reusable civilian career foundation for applications and planning.",
    requirements: ["Upload source records such as FITREPs, EVALs, JST, or VMET.", "Review the output and save the strongest version to your Library."],
  },
  {
    href: "/app/tools/resume-targeter",
    title: "Targeted Resume Engine",
    desc: "Generate a role-specific resume and supporting application output from your career foundation + job description.",
    requirements: ["Have a saved master resume in your Library.", "Complete and save your Profile.", "Paste the full target job posting before generating output."],
    gptHref: "https://chatgpt.com/g/g-697c169088588191bce63407d421f5b0-milvector-ai-targeted-resume-builder",
  },
  {
    href: "https://chatgpt.com/g/g-69b6925c39308191b477586de0b7e6ac-va-c-p-rating-navigator-gpt",
    title: "VA C&P Rating Navigator GPT",
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
    <main className="space-y-4">
      <section className="panel p-6">
        <h1 className="text-2xl font-bold">Tools</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">Run transition workflows, generate decision support, and store outputs for later reuse.</p>
      </section>

      <section className="panel p-6">
        <h2 className="text-lg font-bold">Core Tools</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          MilVector core workflows for military-to-civilian transition support, including career translation, applications, and decision tools.
        </p>
        <p className="mt-3 text-sm text-[var(--muted)]">
          Each core tool has specific requirements. Check them before you start so you get the strongest output on the first pass.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {coreTools.map((tool) => (
            <article key={tool.href} className="rounded-md border border-[var(--line)] p-5">
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
                    Open
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

      <section className="panel p-6">
        <h2 className="text-lg font-bold">Basic Tools</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Supporting tools for role analysis, translation, and transition planning.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {basicTools.map((tool) => (
            <article key={tool.href} className="rounded-md border border-[var(--line)] p-5">
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