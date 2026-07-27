"use client";

import { DragEvent, useEffect, useRef, useState } from "react";
import { FilesSegment } from "@/components/layout/files-segment";
import { UploadWarning } from "@/components/upload-warning";

type DocumentRow = {
  id: string;
  doc_type: "FITREP" | "EVAL" | "VMET" | "JST" | "AWARD" | "MASTER_RESUME" | "RESUME_TEMPLATE" | "TARGETED_RESUME" | "LINKEDIN_PROFILE" | "OTHER";
  filename: string;
  mime_type: string;
  size_bytes: number;
  text_extracted: boolean;
  created_at: string;
  updated_at: string;
};

type DocType = DocumentRow["doc_type"];

const DOC_TYPE_INFO: Record<string, { label: string; hint: string }> = {
  FITREP: { label: "FITREP", hint: "Marine Corps fitness report" },
  EVAL: { label: "EVAL", hint: "Navy performance evaluation" },
  VMET: { label: "VMET", hint: "Verification of Military Experience & Training" },
  JST: { label: "JST", hint: "Joint Services Transcript" },
  AWARD: { label: "Award", hint: "Summary of Action preferred; citation works too" },
  MASTER_RESUME: { label: "Master Resume", hint: "Your reusable base resume" },
  RESUME_TEMPLATE: { label: "Resume Template", hint: "A format you want your resumes to follow" },
  TARGETED_RESUME: { label: "Targeted Resume", hint: "A resume built for one specific job" },
  LINKEDIN_PROFILE: { label: "LinkedIn Profile", hint: "Your LinkedIn profile saved as PDF" },
  OTHER: { label: "Other", hint: "Awards, certificates, anything else useful" },
};

const UPLOAD_TYPES: DocType[] = [
  "FITREP",
  "EVAL",
  "VMET",
  "JST",
  "AWARD",
  "MASTER_RESUME",
  "RESUME_TEMPLATE",
  "LINKEDIN_PROFILE",
  "OTHER",
];

type QueueItem = {
  name: string;
  status: "uploading" | "processing" | "done" | "failed";
  message?: string;
};

function typeInfo(type: string) {
  return DOC_TYPE_INFO[type] ?? { label: type, hint: "" };
}

function formatSize(bytes: number) {
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

export default function DocumentsPage() {
  const [docType, setDocType] = useState<DocType>("FITREP");
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());
  const [redactionSummary, setRedactionSummary] = useState<{ ssn: number; dodId: number } | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState<string>("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function loadDocuments() {
    setLoadingList(true);
    try {
      const res = await fetch("/api/documents", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Couldn't load your documents. Refresh the page to try again.");
        return;
      }
      setDocuments(data.documents ?? []);
    } catch {
      setError("Couldn't load your documents. Check your connection and refresh.");
    } finally {
      setLoadingList(false);
    }
  }

  useEffect(() => {
    void loadDocuments();
  }, []);

  function markProcessing(id: string, on: boolean) {
    setProcessingIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function processDocument(documentId: string) {
    markProcessing(documentId, true);
    setFailedIds((prev) => {
      const next = new Set(prev);
      next.delete(documentId);
      return next;
    });
    try {
      const res = await fetch(`/api/documents/${documentId}/extract`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) {
        setFailedIds((prev) => new Set(prev).add(documentId));
        return false;
      }
      if (data.redactionTotal > 0 && data.redactions) {
        setRedactionSummary((prev) => ({
          ssn: (prev?.ssn ?? 0) + (data.redactions.ssn ?? 0),
          dodId: (prev?.dodId ?? 0) + (data.redactions.dodId ?? 0),
        }));
      }
      return true;
    } catch {
      setFailedIds((prev) => new Set(prev).add(documentId));
      return false;
    } finally {
      markProcessing(documentId, false);
    }
  }

  async function handleFiles(files: FileList | File[]) {
    const list = Array.from(files);
    if (list.length === 0) return;

    setUploading(true);
    setError(null);
    setQueue(list.map((f) => ({ name: f.name, status: "uploading" })));

    for (let i = 0; i < list.length; i++) {
      const file = list[i];
      const setItem = (patch: Partial<QueueItem>) =>
        setQueue((prev) => prev.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));

      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("doc_type", docType);
        const res = await fetch("/api/documents/upload", { method: "POST", body: formData });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setItem({ status: "failed", message: data.error ?? "Upload failed" });
          continue;
        }

        setItem({ status: "processing" });
        await loadDocuments();

        const ok = await processDocument(data.documentId as string);
        setItem(
          ok
            ? { status: "done" }
            : { status: "failed", message: "Uploaded, but we couldn't read the text. Use Try Again on the card below." }
        );
      } catch {
        setItem({ status: "failed", message: "That didn't go through. Check your connection and try again." });
      }
    }

    await loadDocuments();
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    // Clear the queue after a short beat so the user sees the final states
    window.setTimeout(() => setQueue([]), 4000);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    if (uploading) return;
    if (e.dataTransfer.files?.length) void handleFiles(e.dataTransfer.files);
  }

  async function saveRename(documentId: string) {
    const nextName = renameDraft.trim();
    const original = documents.find((d) => d.id === documentId);
    if (!original || !nextName || nextName === original.filename) {
      setRenamingId(null);
      return;
    }
    setBusyId(documentId);
    try {
      const res = await fetch(`/api/documents/${documentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: nextName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) {
        setError(data.error ?? "Couldn't rename that file. Try again.");
        return;
      }
      await loadDocuments();
    } catch {
      setError("That didn't go through. Check your connection and try again.");
    } finally {
      setBusyId(null);
      setRenamingId(null);
      setOpenMenuId(null);
    }
  }

  async function removeDocument(documentId: string) {
    const confirmed = window.confirm("Delete this document? This can't be undone.");
    if (!confirmed) return;
    setBusyId(documentId);
    try {
      const res = await fetch(`/api/documents/${documentId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) {
        setError(data.error ?? "Couldn't delete that file. Try again.");
        return;
      }
      await loadDocuments();
    } catch {
      setError("That didn't go through. Check your connection and try again.");
    } finally {
      setBusyId(null);
      setOpenMenuId(null);
    }
  }

  function statusChip(doc: DocumentRow) {
    if (processingIds.has(doc.id)) {
      return (
        <span className="tool-badge tool-badge-warn" style={{ fontSize: "0.65rem" }}>
          Processing…
        </span>
      );
    }
    if (failedIds.has(doc.id) || (!doc.text_extracted && !processingIds.has(doc.id))) {
      return doc.text_extracted ? null : (
        <span className="tool-badge tool-badge-error" style={{ fontSize: "0.65rem" }}>
          Needs attention
        </span>
      );
    }
    return (
      <span className="tool-badge tool-badge-success" style={{ fontSize: "0.65rem" }}>
        Ready
      </span>
    );
  }

  return (
    <main className="page-shell">

      {/* ── Hero ──────────────────────────────────────────────────── */}
      <section className="page-hero-dark">
        <div className="page-hero-grid">
          <div className="relative z-10">
            <p className="page-kicker-pill">DOCUMENTS</p>
            <h1 className="page-title">
              Drop your records in —{" "}
              <span className="gradient-text">we handle the rest.</span>
            </h1>
            <p className="page-description">
              Upload your FITREPs, EVALs, JST, or VMET and they&apos;re ready for the AI tools automatically. No extra steps.
            </p>
          </div>
          <aside className="page-hero-aside relative z-10">
            <p className="page-hero-aside-title">MOST USEFUL RECORDS</p>
            <ul className="page-hero-list">
              <li>FITREPs and EVALs — your strongest raw material</li>
              <li>JST — your training and education record</li>
              <li>VMET — your experience summary</li>
              <li>A PDF of your LinkedIn profile, if you have one</li>
            </ul>
          </aside>
        </div>
      </section>

      <FilesSegment active="uploads" />

      {/* ── Upload zone ───────────────────────────────────────────── */}
      <section className="section-card">
        <h2 className="section-title">Add Your Records</h2>
        <p className="section-description">
          Pick what kind of document it is, then drop the files in. Everything becomes tool-ready on its own.
        </p>

        <div className="mt-4 grid gap-4 md:grid-cols-[260px_1fr]">
          <div>
            <label className="block space-y-1">
              <span className="text-sm font-medium">What are you uploading?</span>
              <select
                className="input"
                value={docType}
                onChange={(e) => setDocType(e.target.value as DocType)}
                disabled={uploading}
              >
                {UPLOAD_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {typeInfo(type).label}
                  </option>
                ))}
              </select>
            </label>
            <p className="mt-2 text-xs text-[var(--muted)]">{typeInfo(docType).hint}</p>
          </div>

          <div
            role="button"
            tabIndex={0}
            aria-label="Upload files"
            className={`flex min-h-36 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
              dragOver
                ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                : "border-[var(--line)] bg-[var(--surface)] hover:border-[var(--accent)]"
            }`}
            onClick={() => !uploading && fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if ((e.key === "Enter" || e.key === " ") && !uploading) fileInputRef.current?.click();
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--accent)]" aria-hidden>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <path d="M17 8l-5-5-5 5" />
              <path d="M12 3v12" />
            </svg>
            <p className="text-sm font-semibold">
              {uploading ? "Working on it…" : "Drop files here or tap to choose"}
            </p>
            <p className="text-xs text-[var(--muted)]">PDF, Word, or text files · up to 10MB each</p>
            <p className="text-xs text-[var(--muted)]">SSN and DoD ID (EDIPI) numbers are removed automatically</p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.txt,.md,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) void handleFiles(e.target.files);
              }}
            />
          </div>
        </div>

        {/* Upload progress */}
        {queue.length > 0 && (
          <div className="mt-4 grid gap-2">
            {queue.map((item, idx) => (
              <div
                key={`${item.name}-${idx}`}
                className="flex items-center justify-between gap-3 rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2"
              >
                <span className="min-w-0 truncate text-sm">{item.name}</span>
                <span className="flex shrink-0 items-center gap-2">
                  {item.status === "uploading" && (
                    <span className="tool-badge tool-badge-warn" style={{ fontSize: "0.65rem" }}>Uploading…</span>
                  )}
                  {item.status === "processing" && (
                    <span className="tool-badge tool-badge-warn" style={{ fontSize: "0.65rem" }}>Getting it ready…</span>
                  )}
                  {item.status === "done" && (
                    <span className="tool-badge tool-badge-success" style={{ fontSize: "0.65rem" }}>Ready</span>
                  )}
                  {item.status === "failed" && (
                    <span className="tool-badge tool-badge-error" style={{ fontSize: "0.65rem" }}>{item.message ?? "Failed"}</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}

        {redactionSummary && (
          <div className="mt-4 rounded-md border border-[color-mix(in_oklab,var(--accent)_35%,var(--line)_65%)] bg-[var(--accent-soft)] p-3 text-sm">
            <span className="font-semibold text-[var(--accent)]">Protected: </span>
            {[
              redactionSummary.ssn > 0 ? `${redactionSummary.ssn} SSN${redactionSummary.ssn === 1 ? "" : "s"}` : null,
              redactionSummary.dodId > 0 ? `${redactionSummary.dodId} DoD ID${redactionSummary.dodId === 1 ? "" : "s"} (EDIPI)` : null,
            ]
              .filter(Boolean)
              .join(" and ")}{" "}
            automatically removed from your document text before the AI ever sees it.
          </div>
        )}

        <div className="mt-4">
          <UploadWarning />
        </div>

        {/* Where to find your records */}
        <details className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
          <summary className="cursor-pointer text-sm font-semibold">Not sure what to upload, or where to find it?</summary>
          <div className="mt-3 grid gap-3 text-sm text-[var(--muted)] sm:grid-cols-2">
            <div>
              <p className="font-semibold text-[var(--foreground)]">FITREPs / EVALs</p>
              <p className="mt-1">Marines: download from MOL (Marine Online). Sailors: from NSIPS. These carry the most detail about what you actually did — upload as many as you can.</p>
            </div>
            <div>
              <p className="font-semibold text-[var(--foreground)]">JST — Joint Services Transcript</p>
              <p className="mt-1">Your official training and education record. Get it free at jst.doded.mil.</p>
            </div>
            <div>
              <p className="font-semibold text-[var(--foreground)]">VMET</p>
              <p className="mt-1">A summary of your military experience and training. Download it from milConnect (milconnect.dmdc.osd.mil).</p>
            </div>
            <div>
              <p className="font-semibold text-[var(--foreground)]">Awards</p>
              <p className="mt-1">Upload the <span className="font-medium text-[var(--foreground)]">Summary of Action</span> if you have it — it carries the real scope and numbers. The citation works too. Awards add depth to the billet you already held; they won&apos;t create a separate job on your resume.</p>
            </div>
            <div>
              <p className="font-semibold text-[var(--foreground)]">LinkedIn profile</p>
              <p className="mt-1">On LinkedIn, open your profile and use More → Save to PDF. Upload the PDF here.</p>
            </div>
          </div>
        </details>
      </section>

      {/* ── Document list ─────────────────────────────────────────── */}
      <section className="section-card">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="section-title">Your Documents</h2>
            <p className="section-description">Everything you&apos;ve uploaded. &quot;Ready&quot; means the AI tools can use it.</p>
          </div>
          <button className="btn btn-secondary text-sm" type="button" onClick={() => void loadDocuments()} disabled={loadingList}>
            {loadingList ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        {error && (
          <div className="mb-3 rounded-md border border-red-400/30 bg-red-400/5 p-3 text-sm text-red-500">{error}</div>
        )}

        {loadingList ? (
          <p className="text-sm text-[var(--muted)]">Loading your documents…</p>
        ) : documents.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[var(--line)] p-8 text-center">
            <p className="text-sm font-medium text-[var(--muted)]">Nothing here yet</p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Drop your first FITREP, EVAL, JST, or VMET above — it&apos;ll be tool-ready in seconds.
            </p>
          </div>
        ) : (
          <div className="grid gap-3">
            {documents.map((doc) => {
              const info = typeInfo(doc.doc_type);
              const isBusy = busyId === doc.id;
              const isProcessing = processingIds.has(doc.id);
              const menuOpen = openMenuId === doc.id;
              const isRenaming = renamingId === doc.id;

              return (
                <article key={doc.id} className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-[var(--line)] bg-[var(--surface)] px-2.5 py-0.5 text-xs font-semibold text-[var(--muted)]">
                          {info.label}
                        </span>
                        {statusChip(doc)}
                      </div>
                      {isRenaming ? (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <input
                            className="input h-9 max-w-xs text-sm"
                            value={renameDraft}
                            onChange={(e) => setRenameDraft(e.target.value)}
                            autoFocus
                          />
                          <button className="btn btn-primary !min-h-9 !py-1 text-xs" type="button" disabled={isBusy} onClick={() => void saveRename(doc.id)}>
                            {isBusy ? "Saving…" : "Save"}
                          </button>
                          <button className="btn btn-secondary !min-h-9 !py-1 text-xs" type="button" onClick={() => setRenamingId(null)}>
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <p className="mt-1.5 break-words font-semibold">{doc.filename}</p>
                      )}
                      <p className="mt-1 text-xs text-[var(--muted)]">
                        Added {new Date(doc.created_at).toLocaleDateString()} · {formatSize(doc.size_bytes)}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {!doc.text_extracted && !isProcessing && (
                        <button
                          className="btn btn-primary !min-h-9 !py-1 text-xs"
                          type="button"
                          onClick={() => void processDocument(doc.id).then(() => loadDocuments())}
                        >
                          Try Again
                        </button>
                      )}
                      <a className="btn btn-secondary !min-h-9 !py-1 text-xs" href={`/api/documents/${doc.id}/download`}>
                        Download
                      </a>
                      <button
                        className="btn btn-secondary !min-h-9 !py-1 text-xs"
                        type="button"
                        aria-label="More actions"
                        aria-expanded={menuOpen}
                        onClick={() => setOpenMenuId(menuOpen ? null : doc.id)}
                      >
                        •••
                      </button>
                    </div>
                  </div>

                  {menuOpen && !isRenaming && (
                    <div className="mt-3 flex flex-wrap gap-2 border-t border-[var(--line)] pt-3">
                      <button
                        className="btn btn-secondary !min-h-9 !py-1 text-xs"
                        type="button"
                        onClick={() => {
                          setRenameDraft(doc.filename);
                          setRenamingId(doc.id);
                        }}
                      >
                        Rename
                      </button>
                      <button
                        className="btn btn-secondary !min-h-9 !py-1 text-xs"
                        type="button"
                        disabled={isProcessing}
                        onClick={() => void processDocument(doc.id).then(() => loadDocuments())}
                      >
                        {isProcessing ? "Working…" : "Re-process"}
                      </button>
                      <button
                        className="btn btn-secondary !min-h-9 !py-1 text-xs"
                        type="button"
                        disabled={isBusy}
                        onClick={() => void removeDocument(doc.id)}
                      >
                        {isBusy ? "Deleting…" : "Delete"}
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
