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