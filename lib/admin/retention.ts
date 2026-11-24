// The retention timeline for transition records (Brandon's calls, 2026-11-24;
// migration 0046). Counted from when a member last used MilVector:
//
//   under 6 months    Active
//   6 months on       Quiet, nothing sent
//   60 days before    Notice: "your transition records will be cleared on <date>"
//   14 days before    Final notice
//   the clear date    Ready to clear (the admin approves each, for now)
//
// The clear date is 14 months after last use, and never earlier than 6 months
// after the retirement date in the profile. It also never comes sooner than
// the notices allow: the first notice always gives 60 days, and the final
// notice 14, from the day they are actually sent. Using MilVector again starts
// the clock over, and notices sent for an earlier clear date no longer count.

export const RETENTION = {
  quietMonths: 6,
  clearMonths: 14,
  monthsAfterRetirement: 6,
  noticeDays: 60,
  finalDays: 14,
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;

export type RetentionStatus = "active" | "quiet" | "notice_due" | "notice" | "final" | "ready" | "cleared" | "nothing";

export type MemberActivity = {
  joinedAt: string;
  lastSignInAt: string | null;
  lastSeenAt: string | null;
  lastToolRun: string | null;
  retirementDate: string | null; // YYYY-MM-DD
  recordsClearedAt: string | null;
  // Anything that clearing would remove.
  hasRecords: boolean;
};

export type SentNotice = { kind: "notice" | "final" | "cleared"; clear_on: string; sent_at: string };

export type RetentionState = {
  status: RetentionStatus;
  lastActive: Date;
  daysInactive: number;
  // The day the records may be cleared, YYYY-MM-DD.
  clearOn: string;
  noticeSentAt: string | null;
  finalSentAt: string | null;
  // The email the daily job should send now, with the clear date it names.
  due: { kind: "notice" | "final"; clearOn: string } | null;
};

/** The date `months` calendar months after `date` (UTC), held to the month's last day. */
export function addMonths(date: Date, months: number): Date {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + months;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(date.getUTCDate(), last), date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds()));
}

export const ymd = (date: Date) => date.toISOString().slice(0, 10);
const startOfDay = (value: string) => new Date(`${value}T00:00:00.000Z`);
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * DAY_MS);

/** The last time the member used MilVector: the latest of joining, signing in, a page visit, and a tool run. */
export function lastActive(m: MemberActivity): Date {
  const times = [m.joinedAt, m.lastSignInAt, m.lastSeenAt, m.lastToolRun].filter((t): t is string => !!t).map((t) => new Date(t).getTime());
  return new Date(Math.max(...times));
}

/** The clear date from last use and the retirement date alone, before any notice. */
export function baseClearOn(m: MemberActivity): string {
  const fromUse = addMonths(lastActive(m), RETENTION.clearMonths);
  const fromRetirement = m.retirementDate ? addMonths(startOfDay(m.retirementDate), RETENTION.monthsAfterRetirement) : null;
  return ymd(fromRetirement && fromRetirement > fromUse ? fromRetirement : fromUse);
}

export function retentionState(m: MemberActivity, notices: SentNotice[], now: Date): RetentionState {
  const active = lastActive(m);
  const daysInactive = Math.max(0, Math.floor((now.getTime() - active.getTime()) / DAY_MS));
  const base = baseClearOn(m);
  const today = ymd(now);

  // Notices count only for the current stretch of inactivity: one sent for an
  // earlier clear date belongs to a time the member has since come back from.
  const latest = (kind: "notice" | "final", from: string) =>
    notices
      .filter((n) => n.kind === kind && n.clear_on >= from)
      .sort((a, b) => b.sent_at.localeCompare(a.sent_at))[0] ?? null;
  const notice = latest("notice", base);
  // A final notice names the same date as the first, or a later one if it went out late.
  const final = notice ? latest("final", notice.clear_on) : null;
  const clearOn = final?.clear_on ?? notice?.clear_on ?? base;

  const blank = { lastActive: active, daysInactive, clearOn, noticeSentAt: notice?.sent_at ?? null, finalSentAt: final?.sent_at ?? null };

  if (!m.hasRecords) return { ...blank, status: m.recordsClearedAt ? "cleared" : "nothing", due: null };

  if (!notice) {
    // The first notice is due 60 days before the clear date; it always gives a full 60 days.
    if (today >= ymd(addDays(startOfDay(base), -RETENTION.noticeDays))) {
      const named = ymd(new Date(Math.max(startOfDay(base).getTime(), addDays(startOfDay(today), RETENTION.noticeDays).getTime())));
      return { ...blank, clearOn: named, status: "notice_due", due: { kind: "notice", clearOn: named } };
    }
    const quiet = now >= addMonths(active, RETENTION.quietMonths);
    return { ...blank, status: quiet ? "quiet" : "active", due: null };
  }

  if (!final) {
    if (today >= ymd(addDays(startOfDay(clearOn), -RETENTION.finalDays))) {
      // Always a full 14 days from the day it goes out, even if it goes out late.
      const named = ymd(new Date(Math.max(startOfDay(clearOn).getTime(), addDays(startOfDay(today), RETENTION.finalDays).getTime())));
      return { ...blank, clearOn: named, status: "notice", due: { kind: "final", clearOn: named } };
    }
    return { ...blank, status: "notice", due: null };
  }

  return { ...blank, status: today >= clearOn ? "ready" : "final", due: null };
}

/** Days and months in plain words: "3 days", "7 months", "1 year 2 months". */
export function inactiveLabel(days: number): string {
  if (days < 1) return "today";
  if (days < 45) return `${days} ${days === 1 ? "day" : "days"} ago`;
  const months = Math.floor(days / 30.44);
  if (months < 12) return `${months} months ago`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return `${years} ${years === 1 ? "year" : "years"}${rest ? ` ${rest} ${rest === 1 ? "month" : "months"}` : ""} ago`;
}
