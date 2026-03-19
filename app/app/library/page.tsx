import Link from "next/link";
import path from "node:path";
import { readdir, readFile, stat } from "node:fs/promises";
import { supabaseServer } from "@/lib/supabase/server";

type PersonalDocument = {
  id: string;
  doc_type: string;
  filename: string;
  created_at: string;
};

type ResumeArtifact = {
  id: string;
  artifact_type: "master_bullets" | "master_resume" | "targeted_resume";
  title: string;
  created_at: string;
  rendered_document_id?: string | null;
};

type PublicDoc = {
  name: string;
  size: number;
  updatedAt: string;
};

type KnowledgeArticle = {
  id: string;
  title: string;
  category: string;
  content: string;
};

type LibraryLink = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  url: string;
  source: string | null;
  review_status: "ready" | "needs_review";
  raw_reference?: string | null;
};

type WorkbookLinksPayload = {
  links: Array<{
    external_id: string;
    title: string;
    category: string;
    description: string | null;
    url: string | null;
    source: string;
    review_status: "ready" | "needs_review";
    raw_reference?: string;
  }>;
};

async function getPublicDocs(): Promise<PublicDoc[]> {
  const dir = path.join(process.cwd(), "docs", "public");
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    const files = await Promise.all(
      entries
        .filter((entry) => entry.isFile())
        .map(async (entry) => {
          const fullPath = path.join(dir, entry.name);
          const info = await stat(fullPath);
          return {
            name: entry.name,
            size: info.size,
            updatedAt: info.mtime.toISOString(),
          };
        })
    );

    return files.sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

async function getWorkbookLinksFallback(): Promise<LibraryLink[]> {
  const dataFile = path.join(process.cwd(), "data", "milvector_library_links.json");
  try {
    const raw = await readFile(dataFile, "utf8");
    const parsed = JSON.parse(raw) as WorkbookLinksPayload;
    return (parsed.links ?? []).map((link) => ({
      id: link.external_id,
      title: link.title,
      description: link.description,
      category: link.category,
      url: link.url ?? "",
      source: link.source,
      review_status: link.review_status,
      raw_reference: link.raw_reference ?? null,
    }));
  } catch {
    return [];
  }
}

function mergeLinks(primary: LibraryLink[], fallback: LibraryLink[]) {
  const byKey = new Map<string, LibraryLink>();
  for (const link of primary) {
    byKey.set(`${link.title.toLowerCase()}|${link.category.toLowerCase()}`, link);
  }
  for (const link of fallback) {
    const key = `${link.title.toLowerCase()}|${link.category.toLowerCase()}`;
    if (!byKey.has(key)) byKey.set(key, link);
  }
  return [...byKey.values()].sort((a, b) => a.title.localeCompare(b.title));
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  const kb = value / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

export default async function LibraryPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const [personalRes, artifactRes, knowledgeRes, linksRes, publicDocs, workbookFallbackLinks] = await Promise.all([
    supabase
      .from("documents")
      .select("id,doc_type,filename,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("resume_artifacts")
      .select("id,artifact_type,title,created_at,rendered_document_id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("knowledge_articles")
      .select("id,title,category,content")
      .order("created_at", { ascending: false }),
    supabase
      .from("library_links")
      .select("id,title,description,category,url,source,review_status")
      .order("created_at", { ascending: false }),
    getPublicDocs(),
    getWorkbookLinksFallback(),
  ]);

  const personalDocuments = (personalRes.data ?? []) as PersonalDocument[];
  const resumeArtifacts = (artifactRes.data ?? []) as ResumeArtifact[];
  const knowledgeArticles = (knowledgeRes.data ?? []) as KnowledgeArticle[];
  const dbLinks = (linksRes.data ?? []) as LibraryLink[];
  const links = mergeLinks(dbLinks, workbookFallbackLinks);
  const linkCategories = [...new Set(links.map((link) => link.category))].sort((a, b) => a.localeCompare(b));

  return (
    <main className="page-shell">
      <section className="page-hero">
        <div className="page-hero-grid">
          <div className="relative z-10">
            <p className="page-kicker">LIBRARY</p>
            <h1 className="page-title">Keep your documents, outputs, and references in one operating picture.</h1>
            <p className="page-description">The library brings together personal documents, generated artifacts, public resources, knowledge, and vetted links so you can pick up where you left off.</p>
          </div>
          <aside className="page-hero-aside">
            <p className="page-hero-aside-title">HOW TO USE IT</p>
            <ul className="page-hero-list">
              <li>Use Documents for active file management and downloads.</li>
              <li>Use Library to review everything MilVector has collected or produced.</li>
              <li>Expand a section below to move between saved resources quickly.</li>
            </ul>
          </aside>
        </div>
      </section>

      <details className="section-card" id="personal-documents">
        <summary className="cursor-pointer text-lg font-bold">Personal Documents</summary>
        <p className="mt-2 text-sm text-[var(--muted)]">Files you uploaded to your account.</p>
        <div className="mt-3 space-y-3">
          {personalDocuments.length === 0 && <p className="text-sm text-[var(--muted)]">No personal documents yet.</p>}
          {personalDocuments.map((doc) => (
            <article key={doc.id} className="subtle-panel p-3">
              <p className="text-xs font-semibold tracking-wide text-[var(--accent)]">{doc.doc_type}</p>
              <p className="font-semibold">{doc.filename}</p>
              <p className="text-xs text-[var(--muted)]">{new Date(doc.created_at).toLocaleString()}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <a className="btn btn-secondary inline-flex text-sm" href={`/api/documents/${doc.id}/download`}>
                  Download
                </a>
              </div>
            </article>
          ))}
        </div>
        <h3 className="mt-5 text-base font-semibold">Generated Resume Artifacts</h3>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Outputs produced by resume tools (including targeted resumes).
        </p>
        <div className="mt-3 space-y-3">
          {resumeArtifacts.length === 0 && <p className="text-sm text-[var(--muted)]">No generated artifacts yet.</p>}
          {resumeArtifacts.map((artifact) => (
            <article key={artifact.id} className="subtle-panel p-3">
              <p className="text-xs font-semibold tracking-wide text-[var(--accent)]">{artifact.artifact_type}</p>
              <p className="font-semibold">{artifact.title}</p>
              <p className="text-xs text-[var(--muted)]">{new Date(artifact.created_at).toLocaleString()}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <a className="btn btn-secondary inline-flex text-sm" href={`/api/resume-artifacts/${artifact.id}/download`}>
                  Export Text (.txt)
                </a>
                <a
                  className="btn btn-secondary inline-flex text-sm"
                  href={`/api/resume-artifacts/${artifact.id}/download?format=docx`}
                >
                  Export Word (.docx)
                </a>
                {artifact.rendered_document_id && (
                  <a
                    className="btn btn-secondary inline-flex text-sm"
                    href={`/api/documents/${artifact.rendered_document_id}/download`}
                  >
                    Open Saved File
                  </a>
                )}
              </div>
            </article>
          ))}
        </div>
        <Link href="/app/documents" className="btn btn-secondary mt-3 inline-flex text-sm">
          Manage Personal Documents
        </Link>
      </details>

      <details className="section-card" id="public-documents">
        <summary className="cursor-pointer text-lg font-bold">Public Documents</summary>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Shared resources from <code>docs/public</code>.
        </p>
        <div className="mt-3 space-y-3">
          {publicDocs.length === 0 && <p className="text-sm text-[var(--muted)]">No public documents found.</p>}
          {publicDocs.map((file) => (
            <article key={file.name} className="subtle-panel p-3">
              <p className="font-semibold">{file.name}</p>
              <p className="text-xs text-[var(--muted)]">
                {formatBytes(file.size)} - Updated {new Date(file.updatedAt).toLocaleDateString()}
              </p>
              <a
                href={`/api/public-docs/${encodeURIComponent(file.name)}`}
                className="btn btn-secondary mt-2 inline-flex text-sm"
                target="_blank"
                rel="noopener noreferrer"
              >
                Open
              </a>
            </article>
          ))}
        </div>
      </details>

      <details className="section-card" id="knowledge-base">
        <summary className="cursor-pointer text-lg font-bold">Knowledge Base</summary>
        <p className="mt-2 text-sm text-[var(--muted)]">Field-manual guidance organized by transition topic.</p>
        <div className="mt-3 space-y-3">
          {knowledgeArticles.length === 0 && <p className="text-sm text-[var(--muted)]">No knowledge articles yet.</p>}
          {knowledgeArticles.map((article) => (
            <article key={article.id} className="subtle-panel p-3">
              <p className="text-xs font-semibold tracking-wide text-[var(--accent)]">{article.category}</p>
              <h3 className="font-semibold">{article.title}</h3>
              <p className="mt-1 text-sm text-[var(--muted)]">{article.content}</p>
            </article>
          ))}
        </div>
      </details>

      <details className="section-card" id="links">
        <summary className="cursor-pointer text-lg font-bold">Links</summary>
        <p className="mt-2 text-sm text-[var(--muted)]">External tools and reference sites.</p>
        <div className="mt-3 space-y-3">
          {links.length === 0 && <p className="text-sm text-[var(--muted)]">No links yet.</p>}
          {linkCategories.map((category) => {
            const categoryLinks = links.filter((link) => link.category === category);
            return (
              <details key={category} className="subtle-panel p-3">
                <summary className="cursor-pointer font-semibold">
                  {category} <span className="text-xs text-[var(--muted)]">({categoryLinks.length})</span>
                </summary>
                <div className="mt-3 space-y-3">
                  {categoryLinks.map((link) => (
                    <article key={link.id} className="subtle-panel p-3">
                      <h3 className="font-semibold">{link.title}</h3>
                      {link.description && <p className="mt-1 text-sm text-[var(--muted)]">{link.description}</p>}
                      {link.source && <p className="mt-1 text-xs text-[var(--muted)]">Source: {link.source}</p>}
                      {link.url ? (
                        <a href={link.url} className="btn btn-secondary mt-2 inline-flex text-sm" target="_blank" rel="noopener noreferrer">
                          Visit Link
                        </a>
                      ) : (
                        <p className="mt-2 text-xs text-[var(--muted)]">Reference: {link.raw_reference ?? "Needs manual URL review"}</p>
                      )}
                    </article>
                  ))}
                </div>
              </details>
            );
          })}
        </div>
      </details>
    </main>
  );
}
