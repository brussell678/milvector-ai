"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";

const publicLinks = [
  { href: "/", label: "Home" },
  { href: "/platform", label: "Why MilVector" },
  { href: "/tools", label: "Tools" },
  { href: "/knowledge-base", label: "Knowledge Base" },
  { href: "/library", label: "Resource Library" },
  { href: "/message-board", label: "Community" },
  { href: "/feedback", label: "Support" },
  { href: "/donate", label: "Donate" },
  { href: "/auth", label: "Open Workspace" },
];

export function MobileSiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  if (pathname.startsWith("/app")) return null;

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <header className="relative z-50 border-b border-[var(--line)] bg-[color-mix(in_oklab,var(--panel)_94%,transparent)] px-4 py-2 md:hidden">
      <div className="mx-auto flex min-h-12 max-w-6xl items-center justify-between gap-3">
        <Link href="/" className="font-extrabold tracking-wide text-[var(--accent)]" onClick={() => setOpen(false)}>
          MILVECTOR AI
        </Link>
        <button
          type="button"
          className="btn btn-secondary !min-h-11 !px-4 text-sm"
          aria-controls="mobile-public-navigation"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          Menu
        </button>
      </div>
      {open ? (
        <nav id="mobile-public-navigation" className="mx-auto grid max-w-6xl gap-2 pb-3 pt-2" aria-label="Mobile primary">
          {publicLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={isActive(link.href) ? "btn btn-primary w-full text-sm" : "btn btn-secondary w-full text-sm"}
              aria-current={isActive(link.href) ? "page" : undefined}
              onClick={() => setOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          <ThemeToggle />
        </nav>
      ) : null}
    </header>
  );
}
