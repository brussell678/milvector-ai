import Link from "next/link";

const coreTools = [
  {
    href: "/app/tools/fitrep-bullets",
    title: "Master Resume Generator",
    desc: "Turn uploaded military records into a reusable civilian career foundation for applications and planning.",
  },
  {
    href: "/app/tools/resume-targeter",
    title: "Targeted Resume Engine",
    desc: "Generate a role-specific resume and supporting application output from your career foundation + job description.",
  },
  {
    href: "https://chatgpt.com/g/g-69b6925c39308191b477586de0b7e6ac-va-c-p-rating-navigator-gpt",
    title: "VA C&P Rating Navigator GPT",
    desc: "Open the VA C&P Rating Navigator GPT for guided disability rating walkthroughs.",
  },
  {
    href: "https://chatgpt.com/g/g-69b75fcfb8d881918bd6c8a092bdb899-milvector-ai-military-sbp-decision-advisor",
    title: "MilVector AI Military SBP Decision Advisor",
    desc: "Open the Military SBP Decision Advisor for guided Survivor Benefit Plan decision support.",
  },
];

const basicTools = [
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
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {coreTools.map((tool) => (
            <article key={tool.href} className="rounded-md border border-[var(--line)] p-5">
              <h3 className="text-lg font-bold">{tool.title}</h3>
              <p className="mt-1 text-sm text-[var(--muted)]">{tool.desc}</p>
              {tool.href.startsWith("http") ? (
                <a
                  href={tool.href}
                  className="btn btn-secondary mt-4 inline-flex"
                  target="_blank"
                  rel="noreferrer"
                >
                  Open
                </a>
              ) : (
                <Link href={tool.href} className="btn btn-secondary mt-4 inline-flex">
                  Open
                </Link>
              )}
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


