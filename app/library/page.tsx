import { supabaseServer } from "@/lib/supabase/server";
import { LibrarySubmissionForm } from "@/components/library-submission-form";

type LibraryDocument = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  file_url: string;
};

type LibraryLink = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  url: string;
};

export default async function LibraryPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [documentsRes, linksRes] = await Promise.all([
    supabase
      .from("library_documents")
      .select("id,title,description,category,file_url")
      .eq("approved", true)
      .order("created_at", { ascending: false }),
    supabase
      .from("library_links")
      .select("id,title,description,category,url")
      .order("created_at", { ascending: false }),
  ]);

  const documents = (documentsRes.data ?? []) as LibraryDocument[];
  const links = (linksRes.data ?? []) as LibraryLink[];

  return (
    <main className="mx-auto max-w-6xl space-y-4 px-6 md:px-8">
      <section className="panel p-6">
        <h1 className="text-2xl font-bold">Library</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Curated transition documents and useful links.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <article className="panel p-5">
          <h2 className="font-bold">Documents</h2>
          <div className="mt-3 space-y-3">
            {documents.length === 0 && <p className="text-sm text-[var(--muted)]">No approved documents yet.</p>}
            {documents.map((doc) => (
              <article key={doc.id} className="rounded-md border border-[var(--line)] p-3">
                <p className="text-xs font-semibold tracking-wide text-[var(--accent)]">{doc.category}</p>
                <h3 className="font-semibold">{doc.title}</h3>
                {doc.description && <p className="mt-1 text-sm text-[var(--muted)]">{doc.description}</p>}
                <a className="btn btn-secondary mt-2 text-sm" href={doc.file_url} target="_blank" rel="noopener noreferrer">
                  Open Document
                </a>
              </article>
            ))}
          </div>
        </article>

        <article className="panel p-5">
          <h2 className="font-bold">Useful Links</h2>
          <div className="mt-3 space-y-3">
            {links.length === 0 && <p className="text-sm text-[var(--muted)]">No links yet.</p>}
            {links.map((link) => (
              <article key={link.id} className="rounded-md border border-[var(--line)] p-3">
                <p className="text-xs font-semibold tracking-wide text-[var(--accent)]">{link.category}</p>
                <h3 className="font-semibold">{link.title}</h3>
                {link.description && <p className="mt-1 text-sm text-[var(--muted)]">{link.description}</p>}
                <a className="btn btn-secondary mt-2 text-sm" href={link.url} target="_blank" rel="noopener noreferrer">
                  Visit Link
                </a>
              </article>
            ))}
          </div>
        </article>
      </section>

      {user ? (
        <LibrarySubmissionForm />
      ) : (
        <section className="panel p-5 text-sm text-[var(--muted)]">
          Sign in to submit documents for library review.
        </section>
      )}
    </main>
  );
}