"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { X } from "lucide-react";

const BANNER_KEY = "mv-banner-v1";

export function TopBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(BANNER_KEY)) {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  function dismiss() {
    setVisible(false);
    localStorage.setItem(BANNER_KEY, "1");
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
