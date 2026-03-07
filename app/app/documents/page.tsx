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
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
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
      setDocuments(data.documents ?? []);
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
                  const extractedClass = doc.text_extracted ? "btn btn-primary" : "btn btn-secondary";
                  return (
                    <tr key={doc.id} className="border-b border-[var(--line)] last:border-b-0">
                      <td className="px-2 py-3">
                        <p className="font-medium">{doc.filename}</p>
                        <p className="text-xs text-[var(--muted)]">{(doc.size_bytes / 1024).toFixed(0)} KB</p>
                      </td>
                      <td className="px-2 py-3">{doc.doc_type}</td>
                      <td className="px-2 py-3">{new Date(doc.created_at).toLocaleDateString()}</td>
                      <td className="px-2 py-3">{doc.text_extracted ? "Yes" : "No"}</td>
                      <td className="px-2 py-3">
                        <button
                          className={extractedClass}
                          type="button"
                          onClick={() => extract(doc.id)}
                          disabled={isExtracting}
                        >
                          {isExtracting ? "Extracting..." : doc.text_extracted ? "Extracted" : "Extract Text"}
                        </button>
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
