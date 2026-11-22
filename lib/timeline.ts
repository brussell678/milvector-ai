export type MissionPhase = "Planning" | "Positioning" | "Preparation" | "Application";

export const TIMELINE_MARKERS = [24, 18, 12, 9, 6, 3, 0] as const;

export function monthsUntilDate(dateValue: string | null | undefined, now = new Date()): number | null {
  if (!dateValue) return null;
  const target = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;

  const yearDelta = target.getUTCFullYear() - now.getUTCFullYear();
  let months = yearDelta * 12 + (target.getUTCMonth() - now.getUTCMonth());
  if (target.getUTCDate() < now.getUTCDate()) months -= 1;
  return Math.max(0, months);
}

export function daysUntilDate(dateValue: string | null | undefined, now = new Date()): number | null {
  const days = signedDaysUntil(dateValue, now);
  return days === null ? null : Math.max(0, days);
}

/** Days until a date, negative once it has passed (daysUntilDate stops at 0). */
export function signedDaysUntil(dateValue: string | null | undefined, now = new Date()): number | null {
  if (!dateValue) return null;
  const target = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;

  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const end = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate()));
  return Math.ceil((end.getTime() - start.getTime()) / 86400000);
}

// Phase names, shared by the workspace home and the Timeline so both say the
// same thing. Keyed by TIMELINE_MARKERS.
export const PHASE_LABEL: Record<number, string> = {
  24: "24 Months",
  18: "18 Months",
  12: "12 Months",
  9: "9 Months",
  6: "6 Months",
  3: "3 Months",
  0: "Final Approach",
};

export function phaseFromDays(daysUntilEas: number | null): string {
  return PHASE_LABEL[phaseMonthFromDays(daysUntilEas)];
}

/** Where the member is on the Timeline, as a sentence. Empty when no EAS date is set. */
export function phaseSentence(daysUntilEas: number | null): string {
  if (daysUntilEas === null) return "";
  const month = phaseMonthFromDays(daysUntilEas);
  return month === 0 ? "You're on final approach." : `You're in the ${month}-month phase of your Timeline.`;
}

export function phaseMonthFromDays(daysUntilEas: number | null): number {
  if (daysUntilEas === null) return 24;
  if (daysUntilEas > 540) return 24;
  if (daysUntilEas > 365) return 18;
  if (daysUntilEas > 270) return 12;
  if (daysUntilEas > 180) return 9;
  if (daysUntilEas > 90) return 6;
  if (daysUntilEas > 30) return 3;
  return 0;
}

export function phaseFromMonths(monthsUntilEas: number | null): MissionPhase {
  if (monthsUntilEas === null) return "Planning";
  if (monthsUntilEas > 18) return "Planning";
  if (monthsUntilEas > 12) return "Positioning";
  if (monthsUntilEas > 6) return "Preparation";
  return "Application";
}

export function phaseAnchorMonth(phase: MissionPhase): number {
  if (phase === "Planning") return 24;
  if (phase === "Positioning") return 18;
  if (phase === "Preparation") return 12;
  return 6;
}
