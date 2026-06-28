import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { KnowledgeBaseSections } from "@/components/knowledge-base-sections";
import { PageContainer } from "@/components/layout/page-container";

type Article = {
  id: string;
  title: string;
  category: string;
  content: string;
};

const heroStrip = [
  { label: "Field guidance" },
  { label: "Mission categories" },
  { label: "Expand and act" },
  { label: "Connected to tools" },
];

export default async function KnowledgeBasePage() {
  const supabase = await supabaseServer();
  const { data } = await supabase
    .from("knowledge_articles")
    .select("id,title,category,content")
    .order("created_at", { ascending: false });

  const articles = (data ?? []) as Article[];

  return (
    <PageContainer className="flex flex-col gap-6" size="lg">

      {/* ── Dark Hero ──────────────────────────────────────────── */}
      <section className="page-hero-dark">
        <div className="page-hero-grid">
          <div>
            <p className="page-kicker-pill">KNOWLEDGE BASE</p>
            <h1 className="page-title">
              Use transition guidance like a{" "}
              <span className="gradient-text">field manual,</span>
              {" "}not a document dump.
            </h1>
            <p className="page-description">
              Review mission-category guidance, expand the article you need, and move directly into the related MilVector workflow without losing context.
            </p>
          </div>
          <aside className="page-hero-aside">
            <p className="page-hero-aside-title">BEST USE</p>
            <ul className="page-hero-list">
              <li>Start with the category closest to your current friction point.</li>
              <li>Expand only the article you need instead of scanning a long dump.</li>
              <li>Jump from guidance into Tools, Timeline, or Library when you are ready to act.</li>
            </ul>
          </aside>
        </div>

        {/* Guidance type strip */}
        <div className="hero-trust-strip -mx-7 -mb-7 mt-6">
          <div className="grid grid-cols-2 sm:grid-cols-4">
            {heroStrip.map((item) => (
              <div key={item.label} className="hero-trust-item">
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: "#39a67f" }}
                  aria-hidden="true"
                />
                <span
                  className="text-sm font-medium"
                  style={{ color: "rgba(255,255,255,0.65)" }}
                >
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <KnowledgeBaseSections articles={articles} />

      {/* ── Dark CTA Band ──────────────────────────────────────── */}
      <section className="cta-band observe-fade">
        <div className="relative z-10 flex flex-col gap-6 p-10 md:flex-row md:items-center md:justify-between md:p-12">
          <div>
            <p
              className="text-xs font-bold uppercase tracking-[0.2em]"
              style={{ color: "#39a67f" }}
            >
              READY TO ACT
            </p>
            <h2
              className="mt-2 text-2xl font-extrabold text-white md:text-3xl"
              style={{ letterSpacing: "-0.025em", lineHeight: "1.1" }}
            >
              Take the guidance into your workspace.
            </h2>
            <p
              className="mt-2 max-w-lg text-sm leading-relaxed md:text-base"
              style={{ color: "rgba(255,255,255,0.58)" }}
            >
              Connect your records, use the tools, and build a transition plan that puts this guidance into action.
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-3 sm:flex-row">
            <Link href="/auth" className="btn btn-primary px-7 py-3">
              Open Workspace
            </Link>
            <Link href="/library" className="btn btn-hero-ghost px-7 py-3">
              Resource Library
            </Link>
          </div>
        </div>
      </section>

    </PageContainer>
  );
}
