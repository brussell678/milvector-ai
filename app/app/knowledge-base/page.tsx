import { supabaseServer } from "@/lib/supabase/server";
import { KnowledgeBaseSections } from "@/components/knowledge-base-sections";

type Article = {
  id: string;
  title: string;
  category: string;
  content: string;
};

export default async function AppKnowledgeBasePage() {
  const supabase = await supabaseServer();
  const { data } = await supabase
    .from("knowledge_articles")
    .select("id,title,category,content")
    .order("created_at", { ascending: false });

  const articles = (data ?? []) as Article[];

  return (
    <main className="page-shell">
      <section className="page-hero-dark">
        <div className="page-hero-grid">
          <div className="relative z-10">
            <p className="page-kicker-pill">KNOWLEDGE BASE</p>
            <h1 className="page-title">Transition guidance, organized like a field manual.</h1>
            <p className="page-description">
              Find the topic you need, read just that article, and jump straight into the related tool when you&apos;re ready to act.
            </p>
          </div>
          <aside className="page-hero-aside relative z-10">
            <p className="page-hero-aside-title">HOW TO USE IT</p>
            <ul className="page-hero-list">
              <li>Start with the category closest to your current problem.</li>
              <li>Open only the article you need — no scanning walls of text.</li>
              <li>Jump from guidance into the tools when you&apos;re ready to act.</li>
            </ul>
          </aside>
        </div>
      </section>

      <KnowledgeBaseSections articles={articles} />
    </main>
  );
}
