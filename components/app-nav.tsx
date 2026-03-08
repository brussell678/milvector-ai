"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/app", label: "Dashboard" },
  { href: "/app/profile", label: "Profile" },
  { href: "/app/documents", label: "Documents" },
  { href: "/app/tools", label: "Tools" },
  { href: "/app/library", label: "Library" },
  { href: "/app/metrics", label: "Metrics" },
  { href: "/app/feedback", label: "Feedback" },
  { href: "/app/donate", label: "Donate", donate: true },
];

export function AppNav() {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/app") return pathname === "/app";
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <nav className="flex w-full flex-wrap justify-center gap-2" aria-label="App">
      {links.map((link) => {
        const active = isActive(link.href);
        const donateClass = active
          ? "bg-[#cbe7d1] border-[#5a9a6b] text-[#155328] shadow-sm"
          : "bg-[#e7f6ea] border-[#8abf98] text-[#1e6b35] hover:bg-[#d8efde]";
        const defaultClass = active
          ? "bg-[var(--surface)] border-[var(--accent)] text-[var(--accent)] shadow-sm"
          : "btn-secondary";

        return (
          <Link
            key={link.href}
            href={link.href}
            className={`btn text-sm !py-1.5 ${link.donate ? donateClass : defaultClass}`}
            aria-current={active ? "page" : undefined}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
