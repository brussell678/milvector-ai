"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";

export function PublicSiteChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  // The workspace has its own navigation, and a digital business card stands alone.
  if (pathname.startsWith("/app") || pathname.startsWith("/c/")) return null;

  return <>{children}</>;
}

// Site banner and footer are hidden on a digital business card page, which is
// a member's own page and carries only a small MilVector credit.
export function HideOnCardPage({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname.startsWith("/c/")) return null;
  return <>{children}</>;
}
