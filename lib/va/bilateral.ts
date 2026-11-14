// Which ratings can count toward the bilateral factor, 38 CFR 4.26.
//
// The factor applies when there are compensable disabilities of both arms, or
// both legs, or of paired skeletal muscles. "Arms" and "legs" mean the upper
// and lower extremities as a whole: a right thigh disability and a left foot
// disability qualify together (4.26(a)). When both the arms and the legs
// qualify, all of those ratings are combined before the 10 percent is added
// (4.26(b)).
//
// It does not apply to the spine, organs, mental health, hearing, or vision.
// Eyes and ears are paired, but they are rated through their own tables.

import type { RatedCondition } from "@/lib/va/combined";

export type Limb = "upper" | "lower" | "either";
export type Side = "" | "left-upper" | "right-upper" | "both-upper" | "left-lower" | "right-lower" | "both-lower";

const inRange = (n: number, from: number, to: number) => n >= from && n <= to;

/** The extremity a diagnostic code rates, or null when the bilateral factor cannot apply. */
export function limbForCode(code: string): Limb | null {
  const n = Number(code);
  if (!Number.isInteger(n)) return null;

  // Joint replacements: shoulder, elbow, wrist / hip, knee, ankle
  if (inRange(n, 5051, 5053)) return "upper";
  if (inRange(n, 5054, 5056)) return "lower";
  // Amputations: arm, forearm, hand, fingers / thigh, leg, foot, toes
  if (inRange(n, 5120, 5156)) return "upper";
  if (inRange(n, 5160, 5173)) return "lower";
  // Shoulder and arm, elbow and forearm, wrist, hand and fingers
  if (inRange(n, 5200, 5230)) return "upper";
  // Hip and thigh, knee and leg, ankle, foot
  if (inRange(n, 5250, 5284)) return "lower";
  // Muscle groups I to IX (shoulder girdle, arm, forearm, hand) and
  // X to XVIII (foot, leg, thigh, pelvic girdle). XIX to XXIII are torso and neck.
  if (inRange(n, 5301, 5309)) return "upper";
  if (inRange(n, 5310, 5318)) return "lower";
  // Peripheral nerves: paralysis 85xx, neuritis 86xx, neuralgia 87xx
  const nerve = n % 100;
  if (inRange(n, 8510, 8730) && [85, 86, 87].includes(Math.floor(n / 100))) {
    if (inRange(nerve, 10, 19)) return "upper";
    if (inRange(nerve, 20, 30)) return "lower";
  }
  // Vascular disease of the extremities; the code does not say which limb
  if ([7114, 7115, 7117, 7119, 7120, 7121, 7122].includes(n)) return "either";

  return null;
}

export type SidedRating = { rating: number; side: Side };

/**
 * Marks which ratings join the bilateral group. A limb pair qualifies only
 * when both its left and right sides carry a rating above zero.
 */
export function withBilateralFlags(items: SidedRating[]): RatedCondition[] {
  const rated = items.filter((item) => Number.isFinite(item.rating) && item.rating > 0);
  const qualifies = (pair: "upper" | "lower") => {
    const sides = rated.filter((item) => item.side.endsWith(pair)).map((item) => item.side.split("-")[0]);
    return sides.includes("both") || (sides.includes("left") && sides.includes("right"));
  };
  const upper = qualifies("upper");
  const lower = qualifies("lower");

  return items.map((item) => ({
    rating: item.rating,
    bilateral: (upper && item.side.endsWith("upper")) || (lower && item.side.endsWith("lower")),
  }));
}
