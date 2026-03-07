import Link from "next/link";

const links = [
  { href: "/app", label: "Dashboard" },
  { href: "/app/profile", label: "Profile" },
  { href: "/app/documents", label: "Documents" },
  { href: "/app/tools", label: "Tools" },
  { href: "/app/library", label: "Library" },
  { href: "/app/metrics", label: "Metrics" },
];

export function AppNav() {
  return (
    <nav className="flex flex-wrap gap-2">
      {links.map((link) => (
        <Link key={link.href} href={link.href} className="btn btn-secondary !py-1.5 text-sm">
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
