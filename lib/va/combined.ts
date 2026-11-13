// VA combined rating arithmetic, 38 CFR 4.25 and 4.26.
//
// Ratings are not added. Each one takes its percentage of the efficiency left
// after the ratings before it, strongest first, and the running value is
// rounded to a whole number at each step the way the combined ratings table
// is. Only the final value is rounded to the nearest 10 (a 5 rounds up).

export type RatedCondition = {
  rating: number;
  // Paired-limb or paired-skeletal-muscle disabilities affecting both sides
  // qualify for the bilateral factor (4.26). The caller decides which do.
  bilateral?: boolean;
};

export type CombinedResult = {
  // Exact combined value before the final rounding, e.g. 65
  combinedValue: number;
  // Payable combined rating, a multiple of 10
  combinedRating: number;
  // Value of the bilateral group after its 10 percent add-on, if one applied
  bilateralValue: number | null;
  steps: string[];
};

function roundHalfUp(value: number) {
  return Math.floor(value + 0.5);
}

function combineList(ratings: number[], steps: string[], label: string) {
  const sorted = [...ratings].sort((a, b) => b - a);
  let running = 0;
  for (const rating of sorted) {
    if (running === 0) {
      running = rating;
      steps.push(`${label}start with ${rating}`);
      continue;
    }
    const next = roundHalfUp(running + ((100 - running) * rating) / 100);
    steps.push(`${label}${running} combined with ${rating} is ${next}`);
    running = next;
  }
  return running;
}

export function combineRatings(conditions: RatedCondition[]): CombinedResult {
  const valid = conditions.filter((c) => Number.isFinite(c.rating) && c.rating > 0 && c.rating <= 100);
  const steps: string[] = [];
  if (valid.length === 0) return { combinedValue: 0, combinedRating: 0, bilateralValue: null, steps };

  const bilateral = valid.filter((c) => c.bilateral).map((c) => c.rating);
  const others = valid.filter((c) => !c.bilateral).map((c) => c.rating);

  let bilateralValue: number | null = null;
  const pool = [...others];

  // The factor needs disabilities on both sides, so at least two ratings.
  if (bilateral.length >= 2) {
    const combined = combineList(bilateral, steps, "Bilateral: ");
    bilateralValue = Math.min(100, roundHalfUp(combined * 1.1));
    steps.push(`Bilateral factor: ${combined} plus 10 percent of itself is ${bilateralValue}, then treated as one rating`);
    pool.push(bilateralValue);
  } else {
    pool.push(...bilateral);
  }

  const combinedValue = Math.min(100, combineList(pool, steps, ""));
  const combinedRating = Math.min(100, Math.floor((combinedValue + 5) / 10) * 10);
  steps.push(`${combinedValue} rounds to ${combinedRating}`);

  return { combinedValue, combinedRating, bilateralValue, steps };
}
