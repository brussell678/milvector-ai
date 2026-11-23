"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

// The workspace on a phone: one slim sticky bar with the menu button, and a
// single row of the four main sections. Everything else lives in the drawer.
// It matches the public site's header so the menu button never moves or
// disappears when a visitor crosses into the workspace.

type MobileAppNavProps = {
  email?: string | null;
  isAdmin?: boolean;
  unreadBoardNotifications?: number;
  hasRecentToolActivity?: boolean;
};

type MobileLink = { href: string; label: string; badge?: "board" | "tools" };

const primaryLinks: MobileLink[] = [
  { href: "/app", label: "Home" },
  { href: "/app/tools", label: "Tools", badge: "tools" },
  { href: "/app/timeline", label: "Timeline" },
  { href: "/app/documents", label: "My Files" },
];

const secondaryLinks: MobileLink[] = [
  { href: "/app/message-board", label: "Community", badge: "board" },
  { href: "/app/knowledge-base", label: "Knowledge Base" },
  { href: "/app/tools/retirement-calculator", label: "Retirement Pay Calculator" },
  { href: "/app/whats-new", label: "What's New" },
  { href: "/app/feedback", label: "Support" },
  { href: "/app/donate", label: "Donate" },
  { href: "/app/profile", label: "Profile" },
];

export function MobileAppNav({ email, isAdmin = false, unreadBoardNotifications = 0, hasRecentToolActivity = false }: MobileAppNavProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Keep the page behind the drawer from scrolling.
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Close the drawer on route change (state adjusted during render, not in an effect).
  const [lastPathname, setLastPathname] = useState(pathname);
  if (lastPathname !== pathname) {
    setLastPathname(pathname);
    setOpen(false);
  }

  function isActive(href: string) {
    if (href === "/app") return pathname === "/app";
    // "My Files" covers both uploads (Documents) and saved work (Library)
    if (href === "/app/documents") return pathname.startsWith("/app/documents") || pathname.startsWith("/app/library");
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  const drawerLink = (link: MobileLink) => (
    <li key={link.href}>
      <Link
        href={link.href}
        className={isActive(link.href) ? "nav-drawer-link-active" : "nav-drawer-link"}
        aria-current={isActive(link.href) ? "page" : undefined}
        onClick={() => setOpen(false)}
      >
        <span className="flex items-center justify-between gap-2">
          {link.label}
          {link.badge === "board" && unreadBoardNotifications > 0 ? (
            <span className="rounded-full bg-[var(--accent)] px-2 py-0.5 text-[10px] font-semibold text-white">{unreadBoardNotifications}</span>
          ) : null}
        </span>
      </Link>
    </li>
  );

  return (
    <>
      {/* Sticky bar. Negative margins pull it to the screen edges and the top. */}
      <header className="site-nav-glass sticky top-0 z-40 -mx-4 -mt-8 mb-3 px-4 md:hidden">
        <div className="flex min-h-14 items-center justify-between gap-3">
          <Link href="/app" className="flex min-h-11 min-w-0 items-center gap-2.5">
            <Image src="/assets/milvector-ai-logo-transparent.png" alt="" width={30} height={30} className="shrink-0 object-contain" />
            <span className="truncate font-extrabold tracking-wide text-[var(--accent)]">MILVECTOR AI</span>
          </Link>
          <button
            type="button"
            className="btn btn-ghost relative !min-h-11 !min-w-11 !p-2"
            aria-controls="mobile-app-drawer"
            aria-expanded={open}
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((current) => !current)}
          >
            {open ? <X size={22} strokeWidth={2} /> : <Menu size={22} strokeWidth={2} />}
            {!open && unreadBoardNotifications > 0 ? (
              <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-[var(--accent)]" aria-hidden="true" />
            ) : null}
          </button>
        </div>
      </header>

      {/* The four main sections, one tap away, in a single row */}
      <nav className="mb-4 grid grid-cols-4 gap-1 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-1 md:hidden" aria-label="Workspace sections">
        {primaryLinks.map((link) => {
          const active = isActive(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? "page" : undefined}
              className={`relative flex min-h-11 items-center justify-center rounded-lg px-1 text-center text-[0.82rem] font-semibold leading-tight ${
                active ? "bg-[var(--accent)] text-white" : "text-[var(--muted)]"
              }`}
            >
              {link.label}
              {link.badge === "tools" && hasRecentToolActivity && !active ? (
                <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[var(--accent)]" aria-label="Recent activity" />
              ) : null}
            </Link>
          );
        })}
      </nav>

      {open && <div className="nav-drawer-overlay md:hidden" aria-hidden="true" onClick={() => setOpen(false)} />}

      <nav id="mobile-app-drawer" className="nav-drawer md:hidden" data-open={open ? "true" : "false"} aria-label="Workspace menu" aria-hidden={!open} inert={!open}>
        <div className="flex items-center justify-between gap-2 border-b border-[var(--line)] px-4 py-3">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--accent)]">Signed in</p>
            <p className="truncate text-sm text-[var(--muted)]">{email}</p>
          </div>
          <button type="button" className="btn btn-ghost !min-h-11 !min-w-11 shrink-0 !p-2" onClick={() => setOpen(false)} aria-label="Close menu">
            <X size={20} strokeWidth={2} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3">
          <p className="px-3 pb-1 text-[0.68rem] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">Workspace</p>
          <ul className="grid gap-0.5" role="list">
            {primaryLinks.map(drawerLink)}
          </ul>
          <p className="px-3 pb-1 pt-4 text-[0.68rem] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">More</p>
          <ul className="grid gap-0.5" role="list">
            {secondaryLinks.map(drawerLink)}
            {isAdmin ? drawerLink({ href: "/app/admin", label: "Admin" }) : null}
          </ul>
        </div>

        <div className="nav-drawer-footer grid gap-3 border-t border-[var(--line)] px-3 py-4">
          <ThemeToggle />
          <form action="/api/auth/signout" method="post">
            <button className="btn btn-secondary w-full text-sm" type="submit">
              Sign Out
            </button>
          </form>
        </div>
      </nav>
    </>
  );
}
