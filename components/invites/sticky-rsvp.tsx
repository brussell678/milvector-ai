"use client";

import { useEffect, useState } from "react";

// Phones only: an RSVP button pinned to the bottom of the screen once the
// cover has scrolled away, hidden again while the form itself is on screen.
export function StickyRsvp({ dateLine }: { dateLine: string }) {
  const [heroGone, setHeroGone] = useState(false);
  const [formShowing, setFormShowing] = useState(false);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const hero = document.getElementById("invite-hero");
    const form = document.getElementById("rsvp");
    const observers: IntersectionObserver[] = [];
    if (hero) {
      const o = new IntersectionObserver(([entry]) => setHeroGone(!entry.isIntersecting));
      o.observe(hero);
      observers.push(o);
    }
    if (form) {
      const o = new IntersectionObserver(([entry]) => setFormShowing(entry.isIntersecting), { rootMargin: "0px 0px -20% 0px" });
      o.observe(form);
      observers.push(o);
    }
    return () => observers.forEach((o) => o.disconnect());
  }, []);

  if (!heroGone || formShowing) return null;
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-3 border-t border-[var(--iv-line)] bg-[var(--iv-surface)] px-4 py-2.5 md:hidden"
      style={{ paddingBottom: "calc(0.625rem + env(safe-area-inset-bottom))", boxShadow: "0 -8px 24px rgba(0,0,0,0.18)" }}
    >
      <span className="min-w-0 truncate text-sm font-semibold text-[var(--iv-ink)]">{dateLine}</span>
      <a href="#rsvp" className="inline-flex min-h-11 shrink-0 items-center rounded-xl px-6 text-sm font-bold" style={{ background: "var(--iv-accent)", color: "var(--iv-on-accent)" }}>
        RSVP
      </a>
    </div>
  );
}
