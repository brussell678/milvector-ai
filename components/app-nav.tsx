"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavLink = {
  href: string;
  label: string;
  donate?: boolean;
  badge?: "board" | "tools";
};

const workflowLinks: NavLink[] = [
  { href: "/app", label: "Home" },
  { href: "/app/tools", label: "Tools", badge: "tools" },
  { href: "/app/timeline", label: "Timeline" },
  { href: "/app/documents", label: "My Files" },
];

const supportLinks: NavLink[] = [
  { href: "/app/message-board", label: "Community", badge: "board" },
  { href: "/app/feedback", label: "Support" },
  { href: "/app/donate", label: "Donate", donate: true },
];

export function AppNav({ isAdmin = false, unreadBoardNotifications = 0, hasRecentToolActivity = false }: { isAdmin?: boolean; unreadBoardNotifications?: number; hasRecentToolActivity?: boolean }) {
  const pathname = usePathname();

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

  function renderLink(link: NavLink) {
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
        <span className="inline-flex items-center gap-2">
          <span>{link.label}</span>
          {link.badge === "board" && unreadBoardNotifications > 0 ? (
            <span className="rounded-full bg-[var(--accent)] px-2 py-0.5 text-[10px] font-semibold text-white">
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
    <nav className="app-nav-shell" aria-label="App">
      <div className="app-nav-group">
        <p className="app-nav-label">Workspace</p>
        <div className="app-nav-links">{workflowLinks.map(renderLink)}</div>
      </div>
      <div className="app-nav-group">
        <p className="app-nav-label">Support</p>
        <div className="app-nav-links">
          {supportLinks.map(renderLink)}
          {isAdmin ? renderLink({ href: "/app/admin", label: "Admin" }) : null}
        </div>
      </div>
    </nav>
  );
}
