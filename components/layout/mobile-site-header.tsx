"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { Menu, X } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/platform", label: "Why MilVector" },
  { href: "/app/tools", label: "Tools" },
  { href: "/knowledge-base", label: "Knowledge Base" },
  { href: "/library", label: "Resource Library" },
  { href: "/message-board", label: "Community" },
  { href: "/feedback", label: "Support" },
  { href: "/donate", label: "Donate" },
];

export function MobileSiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isAppRoute = pathname.startsWith("/app");

  useEffect(() => {
    if (isAppRoute || !open) {
      document.body.style.overflow = "";
      return;
    }
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open, isAppRoute]);

  // Close drawer on route change
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  if (isAppRoute) return null;

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <>
      {/* Sticky header bar */}
      <header className="site-nav-glass sticky top-0 z-50 px-4 md:hidden">
        <div className="mx-auto flex min-h-14 max-w-6xl items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2.5">
            <Image
              src="/assets/milvector-ai-logo-transparent.png"
              alt="MilVector AI"
              width={30}
              height={30}
              className="object-contain"
            />
            <span className="font-extrabold tracking-wide text-[var(--accent)]">
              MILVECTOR AI
            </span>
          </Link>

          <button
            type="button"
            className="btn btn-ghost !min-h-10 !min-w-10 !p-2"
            aria-controls="mobile-nav-drawer"
            aria-expanded={open}
            aria-label={open ? "Close navigation menu" : "Open navigation menu"}
            onClick={() => setOpen((c) => !c)}
          >
            {open ? (
              <X size={20} strokeWidth={2} />
            ) : (
              <Menu size={20} strokeWidth={2} />
            )}
          </button>
        </div>
      </header>

      {/* Backdrop overlay */}
      {open && (
        <div
          className="nav-drawer-overlay md:hidden"
          aria-hidden="true"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Slide-in drawer */}
      <nav
        id="mobile-nav-drawer"
        className="nav-drawer md:hidden"
        data-open={open ? "true" : "false"}
        aria-label="Mobile navigation"
        aria-hidden={!open}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
          <Link href="/" className="flex items-center gap-2.5" onClick={() => setOpen(false)}>
            <Image
              src="/assets/milvector-ai-logo-transparent.png"
              alt="MilVector AI"
              width={28}
              height={28}
              className="object-contain"
            />
            <span className="font-extrabold tracking-wide text-[var(--accent)]">
              MILVECTOR AI
            </span>
          </Link>
          <button
            type="button"
            className="btn btn-ghost !min-h-9 !min-w-9 !p-2"
            onClick={() => setOpen(false)}
            aria-label="Close navigation menu"
          >
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        {/* Nav links */}
        <div className="flex-1 overflow-y-auto px-3 py-3">
          <ul className="grid gap-0.5" role="list">
            {navLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className={isActive(link.href) ? "nav-drawer-link-active" : "nav-drawer-link"}
                  aria-current={isActive(link.href) ? "page" : undefined}
                  onClick={() => setOpen(false)}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Drawer footer */}
        <div className="nav-drawer-footer grid gap-3 border-t border-[var(--line)] px-3 py-4">
          <Link href="/auth" className="btn btn-primary w-full" onClick={() => setOpen(false)}>
            Open Workspace
          </Link>
          <ThemeToggle />
        </div>
      </nav>
    </>
  );
}
