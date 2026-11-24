// The announcement bar shows one update at a time: the newest published one,
// for this many days after it was published (app/app/layout.tsx). The admin's
// What's New page uses the same window to say which update is on the bar.
export const ANNOUNCEMENT_WINDOW_DAYS = 21;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The update on the bar at `now`, and the day it leaves; null when the bar is empty. */
export function onTheBar(posted: { id: string; published_at: string }[], now: Date): { id: string; until: Date } | null {
  const newest = posted.reduce<{ id: string; published_at: string } | null>((best, u) => (!best || u.published_at > best.published_at ? u : best), null);
  if (!newest) return null;
  const until = new Date(new Date(newest.published_at).getTime() + ANNOUNCEMENT_WINDOW_DAYS * DAY_MS);
  return until > now ? { id: newest.id, until } : null;
}

/** "November 2026", for grouping posted updates by month. */
export function monthLabel(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(new Date(iso));
}

/** Whether a draft has waited longer than `days`. */
export function olderThan(iso: string, days: number, now: Date): boolean {
  return now.getTime() - new Date(iso).getTime() > days * DAY_MS;
}
