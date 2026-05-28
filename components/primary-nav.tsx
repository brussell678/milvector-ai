import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";

const links = [
  { href: "/", label: "Home" },
  { href: "/platform", label: "Why MilVector" },
  { href: "/tools", label: "Tools" },
  { href: "/knowledge-base", label: "Knowledge Base" },
  { href: "/library", label: "Resource Library" },
  { href: "/message-board", label: "Community" },
  { href: "/feedback", label: "Support" },
  { href: "/donate", label: "Donate" },
];

export function PrimaryNav() {
  return (
    <nav className="mx-auto flex w-full max-w-6xl flex-wrap gap-2 px-4 pb-3 sm:px-6 lg:px-8" aria-label="Primary">
      {links.map((link) => (
        <Link key={link.href} href={link.href} className="btn btn-secondary !py-1.5 text-sm">
          {link.label}
        </Link>
      ))}
      <ThemeToggle />
    </nav>
  );
}
