import { supabaseServer } from "@/lib/supabase/server";
import { getLibraryLinkFallbacks, mergeLibraryLinks } from "@/lib/transition-data";
import { LibrarySubmissionForm } from "@/components/library-submission-form";
import { PageContainer } from "@/components/layout/page-container";

type LibraryDocument = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  file_url: string;
  open_url?: string | null;
};

type LibraryLink = {
  id: string;
  external_id?: string | null;
  title: string;
  description: string | null;
  category: string;
  url: string;
  source: string | null;
  review_status: "ready" | "needs_review";
  raw_reference?: string | null;
};

function categoryId(category: string) {
  return category.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

export default async function LibraryPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [documentsRes, linksRes, fallbackLinks] = await Promise.all([
    supabase
      .from("library_documents")
      .select("id,title,description,category,file_url")
      .eq("approved", true)
      .order("created_at", { ascending: false }),
    supabase
      .from("library_links")
      .select("id,external_id,title,description,category,url,source,review_status")
      .eq("review_status", "ready")
      .order("created_at", { ascending: false }),
    getLibraryLinkFallbacks(),
  ]);

  const documents = (documentsRes.data ?? []) as LibraryDocument[];
  const links = mergeLibraryLinks((linksRes.data ?? []) as LibraryLink[], fallbackLinks);
  const documentCategories = [...new Set(documents.map((doc) => doc.category))].sort((a, b) => a.localeCompare(b));
  const linkCategories = [...new Set(links.map((link) => link.category))].sort((a, b) => a.localeCompare(b));
  const documentsWithUrls = await Promise.all(
    documents.map(async (doc) => {
      if (/^https?:\/\//i.test(doc.file_url)) {
        return { ...doc, open_url: doc.file_url };
      }

      const { data } = await supabase.storage.from("library-submissions").createSignedUrl(doc.file_url, 60 * 60);
      return { ...doc, open_url: data?.signedUrl ?? null };
    })
  );

  return (
    <PageContainer className="page-shell" size="lg">
      <section className="page-hero">
        <div className="page-hero-grid">
          <div className="relative z-10">
            <p className="page-kicker">LIBRARY</p>
            <h1 className="page-title">Find curated transition documents and useful links fast.</h1>
            <p className="page-description">
              Browse approved documents, open vetted references, and submit new resources for review when signed in.
            </p>
          </div>
          <aside className="page-hero-aside">
            <p className="page-hero-aside-title">MOBILE FLOW</p>
            <ul className="page-hero-list">
              <li>Jump by category</li>
              <li>Open resources from cards</li>
              <li>Submit additions for review</li>
            </ul>
          </aside>
        </div>
      </section>

      <section className="section-card">
        <div className="grid gap-3 sm:grid-cols-2">
          <a href="#documents" className="subtle-panel block p-4">
            <p className="text-xs font-semibold tracking-wide text-[var(--accent)]">Documents</p>
            <p className="mt-2 text-2xl font-bold">{documentsWithUrls.length}</p>
            <p className="mt-1 text-xs text-[var(--muted)]">Approved resources</p>
          </a>
          <a href="#links" className="subtle-panel block p-4">
            <p className="text-xs font-semibold tracking-wide text-[var(--accent)]">Links</p>
            <p className="mt-2 text-2xl font-bold">{links.length}</p>
            <p className="mt-1 text-xs text-[var(--muted)]">External references</p>
          </a>
        </div>
      </section>

      <section className="section-card scroll-mt-28" id="documents">
        <div>
          <h2 className="section-title">Documents</h2>
          <p className="section-description">Approved files and reference documents organized by category.</p>
        </div>
        <div className="-mx-1 mt-4 flex gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
          {documentCategories.map((category) => (
            <a key={category} href={`#documents-${categoryId(category)}`} className="btn btn-secondary shrink-0 !py-1.5 text-sm">
              {category}
            </a>
          ))}
        </div>
        <div className="mt-4 space-y-4">
          {documentsWithUrls.length === 0 && <p className="text-sm text-[var(--muted)]">No approved documents yet.</p>}
          {documentCategories.map((category) => {
            const categoryDocuments = documentsWithUrls.filter((doc) => doc.category === category);
            return (
              <section key={category} id={`documents-${categoryId(category)}`} className="scroll-mt-28">
                <h3 className="text-base font-semibold">{category}</h3>
                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                  {categoryDocuments.map((doc) => (
                    <article key={doc.id} className="subtle-panel p-4">
                      <p className="text-xs font-semibold tracking-wide text-[var(--accent)]">{doc.category}</p>
                      <h4 className="mt-1 text-base font-semibold leading-snug">{doc.title}</h4>
                      {doc.description && <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{doc.description}</p>}
                      {doc.open_url ? (
                        <a className="btn btn-secondary mt-3 w-full text-sm sm:w-auto" href={doc.open_url} target="_blank" rel="noopener noreferrer">
                          Open Document
                        </a>
                      ) : (
                        <p className="mt-2 text-xs text-[var(--muted)]">Document link unavailable.</p>
                      )}
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </section>

      <section className="section-card scroll-mt-28" id="links">
        <div>
          <h2 className="section-title">Useful Links</h2>
          <p className="section-description">External tools and reference sites grouped for faster scanning.</p>
        </div>
        <div className="-mx-1 mt-4 flex gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
          {linkCategories.map((category) => (
            <a key={category} href={`#links-${categoryId(category)}`} className="btn btn-secondary shrink-0 !py-1.5 text-sm">
              {category}
            </a>
          ))}
        </div>
        <div className="mt-4 space-y-4">
          {links.length === 0 && <p className="text-sm text-[var(--muted)]">No links yet.</p>}
          {linkCategories.map((category) => {
            const categoryLinks = links.filter((link) => link.category === category);
            return (
              <section key={category} id={`links-${categoryId(category)}`} className="scroll-mt-28">
                <h3 className="text-base font-semibold">{category}</h3>
                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                  {categoryLinks.map((link) => (
                    <article key={link.id} className="subtle-panel p-4">
                      <p className="text-xs font-semibold tracking-wide text-[var(--accent)]">{link.category}</p>
                      <h4 className="mt-1 text-base font-semibold leading-snug">{link.title}</h4>
                      {link.description && <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{link.description}</p>}
                      {link.source && <p className="mt-2 text-xs text-[var(--muted)]">Source: {link.source}</p>}
                      <a className="btn btn-secondary mt-3 w-full text-sm sm:w-auto" href={link.url} target="_blank" rel="noopener noreferrer">
                        Visit Link
                      </a>
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </section>

      {user ? (
        <LibrarySubmissionForm />
      ) : (
        <section className="section-card text-sm text-[var(--muted)]">
          Sign in to submit documents for library review.
        </section>
      )}
    </PageContainer>
  );
}
