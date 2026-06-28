"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";

const navLinks = [
  { href: "/platform", label: "Why MilVector" },
  { href: "/app/tools", label: "Tools" },
  { href: "/knowledge-base", label: "Knowledge Base" },
  { href: "/library", label: "Library" },
  { href: "/message-board", label: "Community" },
  { href: "/feedback", label: "Support", hideAt: "md" as const },
  { href: "/donate", label: "Donate", hideAt: "md" as const },
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
        <span className="hidden font-extrabold tracking-wide text-[var(--accent)] lg:block">
          MILVECTOR AI
        </span>
      </Link>

      {/* Center nav links — scrollable on tight viewports */}
      <div className="flex min-w-0 flex-1 items-center justify-center gap-0.5 overflow-x-auto">
        {navLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={[
              isActive(link.href) ? "nav-link-active" : "nav-link",
              link.hideAt === "md" ? "hidden lg:inline-flex" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            aria-current={isActive(link.href) ? "page" : undefined}
          >
            {link.label}
          </Link>
        ))}
      </div>

      {/* Theme toggle — outside scrollable area, between links and CTA */}
      <ThemeToggle />

      {/* Primary CTA — always visible */}
      <Link href="/auth" className="btn btn-primary ml-2 shrink-0 !min-h-9 !py-1.5 text-sm">
        Open Workspace
      </Link>
    </nav>
  );
}
