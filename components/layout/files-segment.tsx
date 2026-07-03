import Link from "next/link";

// Segment control shown on Documents and Library so "My Files" reads as
// one place with two views: what you uploaded, and what MilVector built.
export function FilesSegment({ active }: { active: "uploads" | "saved" }) {
  const base = "flex-1 rounded-lg px-4 py-2 text-center text-sm font-semibold transition-colors";
  const on = "bg-[var(--accent)] text-white shadow-[var(--shadow-sm)]";
  const off = "text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--foreground)]";

  return (
    <nav
      className="flex gap-1 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-1"
      aria-label="My Files sections"
    >
      <Link href="/app/documents" className={`${base} ${active === "uploads" ? on : off}`} aria-current={active === "uploads" ? "page" : undefined}>
        My Uploads
      </Link>
      <Link href="/app/library" className={`${base} ${active === "saved" ? on : off}`} aria-current={active === "saved" ? "page" : undefined}>
        Saved Work &amp; Resources
      </Link>
    </nav>
  );
}
