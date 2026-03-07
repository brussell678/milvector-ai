import Link from "next/link";

const links = [
  { href: "/", label: "Home" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/tools", label: "Tools" },
  { href: "/knowledge-base", label: "Knowledge Base" },
  { href: "/library", label: "Library" },
  { href: "/feedback", label: "Feedback" },
  { href: "/donate", label: "Donate" },
];

export function PrimaryNav() {
  return (
    <nav className="mx-auto flex max-w-6xl flex-wrap gap-2 px-6 pb-3 md:px-8" aria-label="Primary">
      {links.map((link) => (
        <Link key={link.href} href={link.href} className="btn btn-secondary !py-1.5 text-sm">
          {link.label}
        </Link>
      ))}
    </nav>
  );
}