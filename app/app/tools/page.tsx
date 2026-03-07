import Link from "next/link";

const tools = [
  {
    href: "/app/tools/fitrep-bullets",
    title: "Master Resume Builder",
    desc: "Build a high-fidelity master resume from your uploaded military records.",
  },
  {
    href: "/app/tools/mos-translator",
    title: "MOS Translator",
    desc: "Map MOS experience to civilian roles and keywords.",
  },
  {
    href: "/app/tools/jd-decoder",
    title: "Job Description Decoder",
    desc: "Deeply analyze a job posting into requirements, signals, and interview focus areas.",
  },
  {
    href: "/app/tools/resume-targeter",
    title: "Targeted Resume Builder",
    desc: "Generate a role-specific resume from your master resume + job description.",
  },
];

export default function ToolsPage() {
  return (
    <main className="space-y-4">
      <section className="panel p-6">
        <h1 className="text-2xl font-bold">Tools</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">Run AI workflows and store outputs for later recall.</p>
      </section>
      <section className="grid gap-4 md:grid-cols-2">
        {tools.map((tool) => (
          <article key={tool.href} className="panel p-5">
            <h2 className="text-lg font-bold">{tool.title}</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">{tool.desc}</p>
            <Link href={tool.href} className="btn btn-secondary mt-4 inline-flex">
              Open
            </Link>
          </article>
        ))}
      </section>
    </main>
  );
}
