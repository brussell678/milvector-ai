"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";

// Width budget. The row must fit without scrolling at every desktop width,
// with room to spare for a Windows scrollbar and font rendering differences.
// Measured links total about 690px, so:
//   768 to 1023:  logo icon, the first four links (the rest are in the footer)
//   1024 to 1279: logo icon, all eight links
//   1280 and up:  logo with the MILVECTOR AI wordmark, all eight links
// Adding a link means re-measuring: there is about 50px of slack at the
// tightest width in each band.
const navLinks = [
  { href: "/platform", label: "Why MilVector" },
  { href: "/tools", label: "Tools" },
  { href: "/retirement-calculator", label: "Pay Calculator" },
  { href: "/knowledge-base", label: "Knowledge Base" },
  { href: "/library", label: "Library", wideOnly: true },
  { href: "/message-board", label: "Community", wideOnly: true },
  { href: "/feedback", label: "Support", wideOnly: true },
  { href: "/donate", label: "Donate", wideOnly: true },
];

export function PrimaryNav() {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <nav
      className="mx-auto flex w-full max-w-6xl items-center gap-2 px-4 py-2.5 sm:px-6"
      aria-label="Primary"
    >
      {/* Logo + wordmark */}
      <Link href="/" className="mr-2 flex shrink-0 items-center gap-2.5">
        <Image
          src="/assets/milvector-ai-logo-transparent.png"
          alt="MilVector AI"
          width={30}
          height={30}
          className="object-contain"
        />
        <span className="hidden font-extrabold tracking-wide text-[var(--accent)] xl:block">
          MILVECTOR AI
        </span>
      </Link>

      {/* Center nav links. Sized to fit (see the width budget above); the
          scroll setting is only a last resort and should never show. */}
      <div className="flex min-w-0 flex-1 items-center justify-center gap-0.5 overflow-x-auto">
        {navLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={[
              isActive(link.href) ? "nav-link-active" : "nav-link",
              link.wideOnly ? "hidden lg:inline-flex" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            aria-current={isActive(link.href) ? "page" : undefined}
          >
            {link.label}
          </Link>
        ))}
      </div>

      {/* Theme toggle, outside the link row, between links and CTA */}
      <ThemeToggle />

      {/* Primary CTA, always visible */}
      <Link href="/auth" className="btn btn-primary ml-2 shrink-0 !min-h-9 !py-1.5 text-sm">
        Open Workspace
      </Link>
    </nav>
  );
}
