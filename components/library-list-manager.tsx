"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type ArtifactRow = {
  id: string;
  artifact_type: string;
  title: string;
  created_at: string;
  content: string;
};

export function LibraryListManager({ items }: { items: ArtifactRow[] }) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>("");

  const allSelected = useMemo(
    () => items.length > 0 && selectedIds.length === items.length,
    [items.length, selectedIds.length]
  );

  function toggleAll() {
    if (allSelected) setSelectedIds([]);
    else setSelectedIds(items.map((item) => item.id));
  }

  function toggleOne(id: string) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
    );
  }

  async function runBulk(action: "delete" | "duplicate") {
    if (selectedIds.length === 0) return;
    if (action === "delete" && !confirm(`Delete ${selectedIds.length} selected artifacts?`)) return;

    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/resume-artifacts/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ids: selectedIds }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.error ?? "Bulk action failed");
        return;
      }
      setSelectedIds([]);
      setMessage(`${action === "delete" ? "Deleted" : "Duplicated"} ${data.count ?? selectedIds.length} artifacts.`);
      router.refresh();
    } catch {
      setMessage("Network error while running bulk action.");
    } finally {
      setBusy(false);
    }
  }

  async function runRename(id: string, currentTitle: string) {
    const title = prompt("New title", currentTitle)?.trim();
    if (!title || title === currentTitle) return;

    setBusy(true);
    setMessage("");
    try {
      const res = await fetch(`/api/resume-artifacts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.error ?? "Rename failed");
        return;
      }
      setMessage("Artifact renamed.");
      router.refresh();
    } catch {
      setMessage("Network error while renaming artifact.");
    } finally {
      setBusy(false);
    }
  }

  async function runDelete(id: string) {
    if (!confirm("Delete this artifact?")) return;
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch(`/api/resume-artifacts/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.error ?? "Delete failed");
        return;
      }
      setSelectedIds((current) => current.filter((x) => x !== id));
      setMessage("Artifact deleted.");
      router.refresh();
    } catch {
      setMessage("Network error while deleting artifact.");
    } finally {
      setBusy(false);
    }
  }

  async function runDuplicate(id: string) {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/resume-artifacts/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "duplicate", ids: [id] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.error ?? "Duplicate failed");
        return;
      }
      setMessage("Artifact duplicated.");
      router.refresh();
    } catch {
      setMessage("Network error while duplicating artifact.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3">
      <section className="panel flex flex-wrap items-center gap-2 p-4">
        <button className="btn btn-secondary text-sm" type="button" onClick={toggleAll} disabled={busy || items.length === 0}>
          {allSelected ? "Unselect all" : "Select all"}
        </button>
        <button
          className="btn btn-secondary text-sm"
          type="button"
          onClick={() => runBulk("duplicate")}
          disabled={busy || selectedIds.length === 0}
        >
          Duplicate selected
        </button>
        <button
          className="btn btn-secondary text-sm"
          type="button"
          onClick={() => runBulk("delete")}
          disabled={busy || selectedIds.length === 0}
        >
          Delete selected
        </button>
        <p className="text-xs text-[var(--muted)]">{selectedIds.length} selected</p>
      </section>

      {message && <p className="text-sm text-[var(--accent)]">{message}</p>}

      {items.map((item) => (
        <article key={item.id} className="panel p-5">
          <div className="flex flex-wrap items-center gap-2">
            <input
              aria-label={`Select ${item.title}`}
              type="checkbox"
              checked={selectedIds.includes(item.id)}
              onChange={() => toggleOne(item.id)}
            />
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--accent)]">{item.artifact_type}</p>
          </div>
          <h2 className="mt-1 font-bold">{item.title}</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">{new Date(item.created_at).toLocaleString()}</p>
          <p className="mt-3 text-sm text-[var(--muted)]">
            {item.content.length > 220 ? `${item.content.slice(0, 220)}...` : item.content}
          </p>
          <details className="mt-3">
            <summary className="cursor-pointer text-sm font-semibold text-[var(--accent)]">
              Preview full content
            </summary>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-md bg-[#f5f8f6] p-3 text-sm">
              {item.content}
            </pre>
          </details>
          <div className="mt-3 flex flex-wrap gap-2">
            <a className="btn btn-secondary text-sm" href={`/api/resume-artifacts/${item.id}/download`}>
              Export .txt
            </a>
            <a className="btn btn-secondary text-sm" href={`/api/resume-artifacts/${item.id}/download?format=docx`}>
              Export .docx
            </a>
            <button className="btn btn-secondary text-sm" type="button" onClick={() => runRename(item.id, item.title)} disabled={busy}>
              Rename
            </button>
            <button className="btn btn-secondary text-sm" type="button" onClick={() => runDuplicate(item.id)} disabled={busy}>
              Duplicate
            </button>
            <button className="btn btn-secondary text-sm" type="button" onClick={() => runDelete(item.id)} disabled={busy}>
              Delete
            </button>
          </div>
        </article>
      ))}
    </section>
  );
}
