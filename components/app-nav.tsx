import Link from "next/link";

const links = [
  { href: "/app", label: "Dashboard" },
  { href: "/app/profile", label: "Profile" },
  { href: "/app/documents", label: "Documents" },
  { href: "/app/tools", label: "Tools" },
  { href: "/app/library", label: "Library" },
  { href: "/app/knowledge-base", label: "Knowledge Base" },
  { href: "/app/metrics", label: "Metrics" },
  { href: "/app/feedback", label: "Feedback" },
  { href: "/app/donate", label: "Donate", donate: true },
];

export function AppNav() {
  return (
    <nav className="flex w-full flex-wrap justify-center gap-2" aria-label="App">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={`btn text-sm !py-1.5 ${link.donate ? "bg-[#e7f6ea] border-[#8abf98] text-[#1e6b35] hover:bg-[#d8efde]" : "btn-secondary"}`}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}