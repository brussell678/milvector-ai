"use client";

import { useEffect, useState } from "react";
import { useRememberedAnswer } from "@/lib/invites/guest-memory";

// Phones only: the page's main action pinned to the bottom of the screen once
// the cover has scrolled away, hidden again while that section is on screen.
// RSVP before the day, the program on the day, a message afterward. A guest
// who has already answered on this phone is offered their answer instead.
export function StickyAction({ dateLine, label, target, slug, answeredLabel }: { dateLine: string; label: string; target: string; slug: string; answeredLabel?: string }) {
  const answered = !!useRememberedAnswer(slug);
  const shown = answered && answeredLabel ? answeredLabel : label;
  const [heroGone, setHeroGone] = useState(false);
  const [targetShowing, setTargetShowing] = useState(false);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const hero = document.getElementById("invite-hero");
    const section = document.getElementById(target);
    const observers: IntersectionObserver[] = [];
    if (hero) {
      const o = new IntersectionObserver(([entry]) => setHeroGone(!entry.isIntersecting));
      o.observe(hero);
      observers.push(o);
    }
    if (section) {
      const o = new IntersectionObserver(([entry]) => setTargetShowing(entry.isIntersecting), { rootMargin: "0px 0px -20% 0px" });
      o.observe(section);
      observers.push(o);
    }
    return () => observers.forEach((o) => o.disconnect());
  }, [target]);

  if (!heroGone || targetShowing) return null;
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-3 border-t border-[var(--iv-line)] bg-[var(--iv-surface)] px-4 py-2.5 md:hidden"
      style={{ paddingBottom: "calc(0.625rem + env(safe-area-inset-bottom))", boxShadow: "0 -8px 24px rgba(0,0,0,0.18)" }}
    >
      <span className="min-w-0 truncate text-sm font-semibold text-[var(--iv-ink)]">{dateLine}</span>
      <a
        href={`#${target}`}
        className="inline-flex min-h-11 shrink-0 items-center rounded-xl px-6 text-sm font-bold"
        style={{ background: "var(--iv-accent)", color: "var(--iv-on-accent)" }}
      >
        {shown}
      </a>
    </div>
  );
}
