import { supabaseServer } from "@/lib/supabase/server";
import { KnowledgeBaseSections } from "@/components/knowledge-base-sections";
import { PageContainer } from "@/components/layout/page-container";

type Article = {
  id: string;
  title: string;
  category: string;
  content: string;
};

export default async function KnowledgeBasePage() {
  const supabase = await supabaseServer();
  const { data } = await supabase
    .from("knowledge_articles")
    .select("id,title,category,content")
    .order("created_at", { ascending: false });

  const articles = (data ?? []) as Article[];

  return (
    <PageContainer className="page-shell" size="lg">
      <section className="page-hero">
        <div className="page-hero-grid">
          <div className="relative z-10">
            <p className="page-kicker">KNOWLEDGE BASE</p>
            <h1 className="page-title">Use transition guidance like a field manual, not a document dump.</h1>
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
      </section>

      <KnowledgeBaseSections articles={articles} />
    </PageContainer>
  );
}
