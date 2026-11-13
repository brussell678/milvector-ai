"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { setStoredValue, useStoredValue } from "@/lib/use-stored-value";

const BANNER_KEY = "mv-banner-v1";

export function TopBanner() {
  // Undefined until storage is read on the client; null or "" means not dismissed.
  const dismissed = useStoredValue(BANNER_KEY);

  if (dismissed === undefined || dismissed) return null;

  function dismiss() {
    setStoredValue(BANNER_KEY, "1");
  }

  return (
    <div className="site-top-banner">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4">
        <p className="flex-1 text-center text-sm">
          Built by Marines for service members.{" "}
          <Link
            href="/platform"
            className="font-bold text-[var(--accent)] underline hover:no-underline"
          >
            See how MilVector works →
          </Link>
        </p>
        <button
          type="button"
          onClick={dismiss}
          className="btn btn-ghost shrink-0 !min-h-7 !min-w-7 !p-1.5 text-[var(--muted)]"
          aria-label="Dismiss banner"
        >
          <X size={14} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}
