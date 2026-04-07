import Link from "next/link";

type Article = {
  id: string;
  title: string;
  category: string;
  content: string;
};

const categories = [
  "Transition Planning",
  "Military to Civilian Translation",
  "VA Benefits",
  "Education",
  "Employment",
  "Entrepreneurship",
] as const;

const categoryActions: Record<string, { label: string; href: string; detail: string }> = {
  "Transition Planning": {
    label: "Open Timeline",
    href: "/app/timeline",
    detail: "Use the timeline to connect guidance to milestones and current phase work.",
  },
  "Military to Civilian Translation": {
    label: "Open Tools",
    href: "/app/tools",
    detail: "Use translation and resume tools to turn guidance into concrete outputs.",
  },
  "VA Benefits": {
    label: "Open Library",
    href: "/app/library",
    detail: "Keep benefit references and supporting documents close to your workflow.",
  },
  Education: {
    label: "Open Library",
    href: "/app/library",
    detail: "Review documents and vetted links while building your plan.",
  },
  Employment: {
    label: "Open Tools",
    href: "/app/tools",
    detail: "Move from job analysis into targeted resume and interview prep workflows.",
  },
  Entrepreneurship: {
    label: "Open Library",
    href: "/app/library",
    detail: "Use the library as your staging area for research and reference material.",
  },
};

function summarize(content: string) {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (!normalized) return "";

  const firstSentence = normalized.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim();
  return firstSentence && firstSentence.length >= 40 ? firstSentence : normalized;
}

export function KnowledgeBaseSections({ articles }: { articles: Article[] }) {
  const totalArticles = articles.length;

  return (
    <>
      <section className="section-card">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="section-title">Field Manual</h2>
            <p className="section-description">
              Use the category cards below like a quick-reference manual: scan the summary, expand the article, then move directly into the related workflow.
            </p>
          </div>
          <div className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--muted)]">
            <p>{totalArticles} articles available</p>
            <p>{categories.length} mission categories</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {categories.map((category) => (
            <a key={category} href={`#${category.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`} className="btn btn-secondary inline-flex !py-1.5 text-sm">
              {category}
            </a>
          ))}
        </div>
      </section>

      {categories.map((category) => {
        const group = articles.filter((article) => article.category === category);
        const action = categoryActions[category];

        return (
          <section
            key={category}
            id={category.toLowerCase().replace(/[^a-z0-9]+/g, "-")}
            className="section-card"
          >
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="section-title">{category}</h2>
                <p className="section-description">
                  {group.length === 0
                    ? "This category is ready for more field-manual content."
                    : `${group.length} article${group.length === 1 ? "" : "s"} in this category.`}
                </p>
              </div>
              <div className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--muted)] md:max-w-sm">
                <p className="font-semibold text-[var(--foreground)]">{action.label}</p>
                <p className="mt-1">{action.detail}</p>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {group.length === 0 && (
                <article className="subtle-panel p-4">
                  <p className="text-sm text-[var(--muted)]">No articles published in this category yet.</p>
                </article>
              )}

              {group.map((article) => (
                <details key={article.id} className="subtle-panel p-4">
                  <summary className="cursor-pointer">
                    <p className="font-semibold">{article.title}</p>
                    <p className="mt-2 text-sm text-[var(--muted)]">{summarize(article.content)}</p>
                  </summary>
                  <div className="mt-4 border-t border-[var(--line)] pt-4">
                    <p className="text-sm leading-6 text-[var(--muted)]">{article.content}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Link href={action.href} className="btn btn-secondary inline-flex text-sm">
                        {action.label}
                      </Link>
                    </div>
                  </div>
                </details>
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}
