"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { GA_MEASUREMENT_ID, shouldDisableAnalytics } from "@/lib/analytics";

// Keeps measurement off inside the workspace after client-side navigation.
export function AnalyticsGuard() {
  const pathname = usePathname() ?? "/";

  useEffect(() => {
    (window as unknown as Record<string, boolean>)[`ga-disable-${GA_MEASUREMENT_ID}`] = shouldDisableAnalytics(
      pathname,
      window.location.search,
    );
  }, [pathname]);

  return null;
}
