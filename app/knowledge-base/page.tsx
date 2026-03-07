import { supabaseServer } from "@/lib/supabase/server";

const categories = [
  "Transition Planning",
  "Military to Civilian Translation",
  "VA Benefits",
  "Education",
  "Employment",
  "Entrepreneurship",
];

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
    <main className="mx-auto max-w-6xl space-y-4 px-6 md:px-8">
      <section className="panel p-6">
        <h1 className="text-2xl font-bold">Knowledge Base</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Field-manual style transition guidance organized by mission category.
        </p>
      </section>

      {categories.map((category) => {
        const group = articles.filter((article) => article.category === category);
        return (
          <section key={category} className="panel p-5">
            <h2 className="font-semibold">{category}</h2>
            <div className="mt-3 space-y-3">
              {group.length === 0 && <p className="text-sm text-[var(--muted)]">No articles yet.</p>}
              {group.map((article) => (
                <article key={article.id} className="rounded-md border border-[var(--line)] p-3">
                  <h3 className="font-semibold">{article.title}</h3>
                  <p className="mt-1 text-sm text-[var(--muted)]">{article.content}</p>
                </article>
              ))}
            </div>
          </section>
        );
      })}
    </main>
  );
}