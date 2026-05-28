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
    <nav
      className="panel mx-auto flex w-full max-w-5xl flex-wrap justify-center gap-1.5 px-2 py-2 sm:px-3"
      aria-label="Primary"
    >
      {links.map((link) => (
        <Link key={link.href} href={link.href} className="btn btn-secondary !py-1.5 text-sm">
          {link.label}
        </Link>
      ))}
      <ThemeToggle />
    </nav>
  );
}
