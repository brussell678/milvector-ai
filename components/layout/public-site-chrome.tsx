"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";

export function PublicSiteChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (pathname.startsWith("/app")) return null;

  return <>{children}</>;
}
