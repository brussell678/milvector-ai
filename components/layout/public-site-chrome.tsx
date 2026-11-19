"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";

// A member's own pages (a digital business card at /c/, a retirement
// invitation at /r/) stand alone: no site menus, banner, or footer. They carry
// only a small MilVector credit of their own.
export function isMemberPage(pathname: string) {
  return pathname.startsWith("/c/") || pathname.startsWith("/r/");
}

export function PublicSiteChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  // The workspace has its own navigation.
  if (pathname.startsWith("/app") || isMemberPage(pathname)) return null;

  return <>{children}</>;
}

// Site banner and footer are hidden on a member's own page.
export function HideOnCardPage({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (isMemberPage(pathname)) return null;
  return <>{children}</>;
}
