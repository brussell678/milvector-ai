"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

type MobileAppNavProps = {
  isAdmin?: boolean;
  unreadBoardNotifications?: number;
  hasRecentToolActivity?: boolean;
};

type MobileLink = {
  href: string;
  label: string;
  badge?: "board" | "tools";
};

const primaryLinks: MobileLink[] = [
  { href: "/app", label: "Home" },
  { href: "/app/tools", label: "Tools", badge: "tools" },
  { href: "/app/timeline", label: "Timeline" },
  { href: "/app/documents", label: "My Files" },
];

const secondaryLinks: MobileLink[] = [
  { href: "/app/message-board", label: "Community", badge: "board" },
  { href: "/app/profile", label: "Profile" },
  { href: "/app/knowledge-base", label: "Knowledge Base" },
  { href: "/app/feedback", label: "Support" },
  { href: "/app/donate", label: "Donate" },
];

export function MobileAppNav({ isAdmin = false, unreadBoardNotifications = 0, hasRecentToolActivity = false }: MobileAppNavProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  function isActive(href: string) {
    if (href === "/app") return pathname === "/app";
    // "My Files" covers both uploads (Documents) and saved work (Library)
    if (href === "/app/documents") {
      return (
        pathname.startsWith("/app/documents") || pathname.startsWith("/app/library")
      );
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  function renderLink(link: MobileLink) {
    const active = isActive(link.href);
    return (
      <Link
        key={link.href}
        href={link.href}
        className={active ? "btn btn-primary w-full text-sm" : "btn btn-secondary w-full text-sm"}
        aria-current={active ? "page" : undefined}
        onClick={() => setOpen(false)}
      >
        <span className="inline-flex items-center gap-2">
          <span>{link.label}</span>
          {link.badge === "board" && unreadBoardNotifications > 0 ? (
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold">
              {unreadBoardNotifications}
            </span>
          ) : null}
          {link.badge === "tools" && hasRecentToolActivity ? (
            <span className="h-2 w-2 rounded-full bg-[var(--accent)]" aria-label="Recent activity" />
          ) : null}
        </span>
      </Link>
    );
  }

  return (
    <nav className="mb-4 grid gap-3 md:hidden" aria-label="Mobile app">
      <div className="grid grid-cols-2 gap-2">
        {primaryLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={isActive(link.href) ? "btn btn-primary text-sm" : "btn btn-secondary text-sm"}
            aria-current={isActive(link.href) ? "page" : undefined}
          >
            <span className="inline-flex items-center gap-1.5">
              {link.label}
              {link.badge === "tools" && hasRecentToolActivity ? (
                <span className="h-2 w-2 rounded-full bg-[var(--accent)]" aria-label="Recent activity" />
              ) : null}
            </span>
          </Link>
        ))}
      </div>
      <button
        type="button"
        className="btn btn-secondary w-full text-sm"
        aria-controls="mobile-app-secondary-navigation"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {open ? "Close Workspace Menu" : "More Workspace Links"}
      </button>
      {open ? (
        <div id="mobile-app-secondary-navigation" className="panel grid gap-2 p-3">
          {secondaryLinks.map(renderLink)}
          {isAdmin ? renderLink({ href: "/app/admin", label: "Admin" }) : null}
          <form action="/api/auth/signout" method="post">
            <button className="btn btn-secondary w-full text-sm" type="submit">
              Sign Out
            </button>
          </form>
        </div>
      ) : null}
    </nav>
  );
}
