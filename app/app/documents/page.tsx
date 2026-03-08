"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type DocumentRow = {
  id: string;
  doc_type: "FITREP" | "EVAL" | "VMET" | "JST" | "MASTER_RESUME" | "RESUME_TEMPLATE" | "OTHER";
  filename: string;
  mime_type: string;
  size_bytes: number;
  text_extracted: boolean;
  created_at: string;
  updated_at: string;
};

const DOC_TYPES: Array<DocumentRow["doc_type"]> = [
  "FITREP",
  "EVAL",
  "VMET",
  "JST",
  "MASTER_RESUME",
  "RESUME_TEMPLATE",
  "OTHER",
];

export default function DocumentsPage() {
  const [file, setFile] = useState<File | null>(null);
  const [docType, setDocType] = useState<DocumentRow["doc_type"]>("FITREP");
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [busyUpload, setBusyUpload] = useState(false);
  const [extractingId, setExtractingId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { filename: string }>>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const selectedFilename = useMemo(() => file?.name ?? "No file selected", [file]);

  async function loadDocuments() {
    setLoadingList(true);
    try {
      const res = await fetch("/api/documents", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Failed to load documents");
        return;
      }
      const nextDocs = data.documents ?? [];
      setDocuments(nextDocs);
      setDrafts(
        Object.fromEntries(
          nextDocs.map((doc: DocumentRow) => [doc.id, { filename: doc.filename }])
        )
      );
    } catch {
      setError("Network error while loading documents.");
    } finally {
      setLoadingList(false);
    }
  }

  useEffect(() => {
    loadDocuments();
  }, []);

  async function upload(e: FormEvent) {
    e.preventDefault();
    if (!file) return;

    setBusyUpload(true);
    setStatus(null);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("doc_type", docType);

    try {
      const res = await fetch("/api/documents/upload", { method: "POST", body: formData });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Upload failed");
        return;
      }
      setStatus(`Uploaded ${file.name}. Click Extract on the row below.`);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await loadDocuments();
    } catch {
      setError("Network error while uploading document.");
    } finally {
      setBusyUpload(false);
    }
  }

  async function extract(documentId: string) {
    setExtractingId(documentId);
    setStatus(null);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${documentId}/extract`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) {
        setError(data.error ?? "Extraction failed");
        return;
      }
      setStatus("Text extracted successfully.");
      await loadDocuments();
    } catch {
      setError("Network error while extracting text.");
    } finally {
      setExtractingId(null);
    }
  }

  async function saveMetadata(documentId: string) {
    const draft = drafts[documentId];
    const original = documents.find((d) => d.id === documentId);
    if (!draft || !original) return;
    if (draft.filename.trim() === original.filename) return;

    setSavingId(documentId);
    setStatus(null);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${documentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: draft.filename.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) {
        setError(data.error ?? "Failed to update document");
        return;
      }
      setStatus("Document details updated.");
      await loadDocuments();
    } catch {
      setError("Network error while updating document.");
    } finally {
      setSavingId(null);
    }
  }

  async function removeDocument(documentId: string) {
    const confirmed = window.confirm("Delete this document? This cannot be undone.");
    if (!confirmed) return;

    setDeletingId(documentId);
    setStatus(null);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${documentId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) {
        setError(data.error ?? "Failed to delete document");
        return;
      }
      setStatus("Document deleted.");
      await loadDocuments();
    } catch {
      setError("Network error while deleting document.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <main className="space-y-4">
      <section className="panel p-6">
        <h1 className="text-2xl font-bold">Documents</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Upload all source documents here (FITREP, EVAL, VMET, JST, MASTER_RESUME, template files), then extract text for tools.
        </p>
      </section>

      <section className="panel p-6">
        <form onSubmit={upload} className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[220px_1fr]">
            <label className="space-y-1">
              <span className="text-sm font-medium">Document Type</span>
              <select className="input" value={docType} onChange={(e) => setDocType(e.target.value as DocumentRow["doc_type"])}>
                {DOC_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>
            <div className="space-y-1">
              <span className="text-sm font-medium">File</span>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.txt,.md,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                <button className="btn btn-secondary" type="button" onClick={() => fileInputRef.current?.click()}>
                  Choose File
                </button>
                <span className="text-sm text-[var(--muted)]">{selectedFilename}</span>
              </div>
            </div>
          </div>
          <button className="btn btn-primary" type="submit" disabled={busyUpload || !file}>
            {busyUpload ? "Uploading..." : "Upload Document"}
          </button>
        </form>
      </section>

      <section className="panel p-6">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">Uploaded Documents</h2>
          <button className="btn btn-secondary text-sm" type="button" onClick={loadDocuments} disabled={loadingList}>
            {loadingList ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {loadingList ? (
          <p className="text-sm text-[var(--muted)]">Loading documents...</p>
        ) : documents.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No documents uploaded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--line)] text-left text-[var(--muted)]">
                  <th className="px-2 py-2">Filename</th>
                  <th className="px-2 py-2">Type</th>
                  <th className="px-2 py-2">Uploaded</th>
                  <th className="px-2 py-2">Extracted</th>
                  <th className="px-2 py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => {
                  const isExtracting = extractingId === doc.id;
                  const isSaving = savingId === doc.id;
                  const isDeleting = deletingId === doc.id;
                  const extractedClass = doc.text_extracted ? "btn btn-primary" : "btn btn-secondary";
                  const draft = drafts[doc.id] ?? { filename: doc.filename };
                  const isDirty = draft.filename.trim() !== doc.filename;
                  return (
                    <tr key={doc.id} className="border-b border-[var(--line)] last:border-b-0">
                      <td className="px-2 py-3">
                        <input
                          className="input h-9 text-sm"
                          value={draft.filename}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [doc.id]: { ...draft, filename: e.target.value },
                            }))
                          }
                        />
                        <p className="text-xs text-[var(--muted)]">{(doc.size_bytes / 1024).toFixed(0)} KB</p>
                      </td>
                      <td className="px-2 py-3">{doc.doc_type}</td>
                      <td className="px-2 py-3">{new Date(doc.created_at).toLocaleDateString()}</td>
                      <td className="px-2 py-3">{doc.text_extracted ? "Yes" : "No"}</td>
                      <td className="px-2 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            className="btn btn-secondary"
                            type="button"
                            onClick={() => saveMetadata(doc.id)}
                            disabled={!isDirty || isSaving || isDeleting}
                          >
                            {isSaving ? "Saving..." : "Save"}
                          </button>
                          <button
                            className={extractedClass}
                            type="button"
                            onClick={() => extract(doc.id)}
                            disabled={isExtracting || isSaving || isDeleting}
                          >
                            {isExtracting ? "Extracting..." : doc.text_extracted ? "Re-Extract" : "Extract Text"}
                          </button>
                          <button
                            className="btn btn-secondary"
                            type="button"
                            onClick={() => removeDocument(doc.id)}
                            disabled={isDeleting || isSaving || isExtracting}
                          >
                            {isDeleting ? "Deleting..." : "Delete"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {status && (
        <section className="panel border-[var(--accent)] p-4">
          <p className="text-sm font-medium text-[var(--accent)]">{status}</p>
        </section>
      )}
      {error && (
        <section className="panel border-[#d69f9f] p-4">
          <p className="text-sm font-medium text-red-700">{error}</p>
        </section>
      )}
    </main>
  );
}
