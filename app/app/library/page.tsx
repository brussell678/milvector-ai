import Link from "next/link";
import path from "node:path";
import { readdir, stat } from "node:fs/promises";
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

  const [personalRes, artifactRes, knowledgeRes, linksRes, publicDocs] = await Promise.all([
    supabase
      .from("documents")
      .select("id,doc_type,filename,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("resume_artifacts")
      .select("id,artifact_type,title,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("knowledge_articles")
      .select("id,title,category,content")
      .order("created_at", { ascending: false }),
    supabase
      .from("library_links")
      .select("id,title,description,category,url,source,review_status")
      .eq("review_status", "ready")
      .order("created_at", { ascending: false }),
    getPublicDocs(),
  ]);

  const personalDocuments = (personalRes.data ?? []) as PersonalDocument[];
  const resumeArtifacts = (artifactRes.data ?? []) as ResumeArtifact[];
  const knowledgeArticles = (knowledgeRes.data ?? []) as KnowledgeArticle[];
  const links = (linksRes.data ?? []) as LibraryLink[];

  return (
    <main className="space-y-4">
      <section className="panel p-6">
        <h1 className="text-2xl font-bold">Library</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Your unified resource center: personal documents, public documents, knowledge base, and links.
        </p>
        <p className="mt-1 text-xs text-[var(--muted)]">Expand a section below to view details.</p>
      </section>

      <details className="panel p-5" id="personal-documents">
        <summary className="cursor-pointer text-lg font-bold">Personal Documents</summary>
        <p className="mt-2 text-sm text-[var(--muted)]">Files you uploaded to your account.</p>
        <div className="mt-3 space-y-3">
          {personalDocuments.length === 0 && <p className="text-sm text-[var(--muted)]">No personal documents yet.</p>}
          {personalDocuments.map((doc) => (
            <article key={doc.id} className="rounded-md border border-[var(--line)] p-3">
              <p className="text-xs font-semibold tracking-wide text-[var(--accent)]">{doc.doc_type}</p>
              <p className="font-semibold">{doc.filename}</p>
              <p className="text-xs text-[var(--muted)]">{new Date(doc.created_at).toLocaleString()}</p>
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
            <article key={artifact.id} className="rounded-md border border-[var(--line)] p-3">
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
              </div>
            </article>
          ))}
        </div>
        <Link href="/app/documents" className="btn btn-secondary mt-3 inline-flex text-sm">
          Manage Personal Documents
        </Link>
      </details>

      <details className="panel p-5" id="public-documents">
        <summary className="cursor-pointer text-lg font-bold">Public Documents</summary>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Shared resources from <code>docs/public</code>.
        </p>
        <div className="mt-3 space-y-3">
          {publicDocs.length === 0 && <p className="text-sm text-[var(--muted)]">No public documents found.</p>}
          {publicDocs.map((file) => (
            <article key={file.name} className="rounded-md border border-[var(--line)] p-3">
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

      <details className="panel p-5" id="knowledge-base">
        <summary className="cursor-pointer text-lg font-bold">Knowledge Base</summary>
        <p className="mt-2 text-sm text-[var(--muted)]">Field-manual guidance organized by transition topic.</p>
        <div className="mt-3 space-y-3">
          {knowledgeArticles.length === 0 && <p className="text-sm text-[var(--muted)]">No knowledge articles yet.</p>}
          {knowledgeArticles.map((article) => (
            <article key={article.id} className="rounded-md border border-[var(--line)] p-3">
              <p className="text-xs font-semibold tracking-wide text-[var(--accent)]">{article.category}</p>
              <h3 className="font-semibold">{article.title}</h3>
              <p className="mt-1 text-sm text-[var(--muted)]">{article.content}</p>
            </article>
          ))}
        </div>
      </details>

      <details className="panel p-5" id="links">
        <summary className="cursor-pointer text-lg font-bold">Links</summary>
        <p className="mt-2 text-sm text-[var(--muted)]">External tools and reference sites.</p>
        <div className="mt-3 space-y-3">
          {links.length === 0 && <p className="text-sm text-[var(--muted)]">No links yet.</p>}
          {links.map((link) => (
            <article key={link.id} className="rounded-md border border-[var(--line)] p-3">
              <p className="text-xs font-semibold tracking-wide text-[var(--accent)]">{link.category}</p>
              <h3 className="font-semibold">{link.title}</h3>
              {link.description && <p className="mt-1 text-sm text-[var(--muted)]">{link.description}</p>}
              {link.source && <p className="mt-1 text-xs text-[var(--muted)]">Source: {link.source}</p>}
              <a href={link.url} className="btn btn-secondary mt-2 inline-flex text-sm" target="_blank" rel="noopener noreferrer">
                Visit Link
              </a>
            </article>
          ))}
        </div>
      </details>
    </main>
  );
}
