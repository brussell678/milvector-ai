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
  if (!dateValue) return null;
  const target = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;

  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const end = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate()));
  const diffMs = end.getTime() - start.getTime();
  const days = Math.ceil(diffMs / 86400000);
  return Math.max(0, days);
}

export function phaseFromDays(daysUntilEas: number | null): string {
  if (daysUntilEas === null) return "24 months";
  if (daysUntilEas > 540) return "24 months";
  if (daysUntilEas > 365) return "18 months";
  if (daysUntilEas > 270) return "12 months";
  if (daysUntilEas > 180) return "9 months";
  if (daysUntilEas > 90) return "6 months";
  if (daysUntilEas > 30) return "3 months";
  return "Final";
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
