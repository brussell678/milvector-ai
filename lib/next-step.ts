// The workspace home's "Do this next". Time-critical retirement steps come
// first while they are open and not checked off on the Timeline; otherwise
// the member's place in the resume path (app/app/page.tsx).
//
// Sources (checked 2026-11-22):
// - VA Benefits Delivery at Discharge: file 180 to 90 days before separation;
//   with fewer than 90 days left a pre-discharge claim can still be filed, just
//   not through BDD (va.gov/disability/how-to-file-claim/when-to-file/pre-discharge-claim).
// - A claim filed within a year of separation can be effective from the day
//   after separation (va.gov/disability/effective-date).
// - SBP: the DD Form 2656 is signed before the retirement date; with no
//   election, full spouse coverage starts automatically; elections can't be
//   changed after retirement except for life events (dfas.mil, militarypay.defense.gov).

export type NextStep = { href: string; label: string; detail?: string; deadline?: boolean };

// Timeline tasks (data/milvector_transition_tasks.json) that mark these done.
export const VA_CLAIM_TASK = "mv-0014";
export const SBP_TASK = "mv-0084";

const VA_TOOL = "/app/tools/va-rating-navigator";
const SBP_TOOL = "/app/tools/sbp-advisor";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * A time-critical step, or null. `daysUntilEas` is signed: negative once the
 * date has passed. `done` holds the Timeline task ids the member checked off.
 */
export function deadlineStep(daysUntilEas: number | null, done: ReadonlySet<string>): NextStep | null {
  if (daysUntilEas === null) return null;
  const d = daysUntilEas;
  const vaOpen = !done.has(VA_CLAIM_TASK);
  const sbpOpen = !done.has(SBP_TASK);

  // 1. The pre-discharge (BDD) window closes for good at 90 days.
  if (vaOpen && d >= 90 && d <= 180) {
    return {
      href: VA_TOOL,
      label: "File your VA claim",
      detail: `Your pre-discharge window (BDD) closes in ${plural(d - 90, "day")}. Filing inside it can get you a decision sooner after you separate.`,
      deadline: true,
    };
  }

  // 2. SBP is locked in at retirement.
  if (sbpOpen && d >= 0 && d <= 120) {
    return {
      href: SBP_TOOL,
      label: "Make your SBP decision",
      detail:
        "Retiring? Your SBP election (DD Form 2656) is signed before your retirement date and can't be changed after, except for life events. With no election, full spouse coverage starts automatically.",
      deadline: true,
    };
  }

  // 3. BDD has closed, but a claim can still be filed before separating.
  if (vaOpen && d >= 0 && d < 90) {
    return {
      href: VA_TOOL,
      label: "File your VA claim",
      detail: "The pre-discharge window (BDD) has closed, but you can still file your claim before you separate.",
      deadline: true,
    };
  }

  // 4. After separation: within a year, it can count from the day after.
  if (vaOpen && d < 0 && d > -365) {
    return {
      href: VA_TOOL,
      label: "File your VA claim",
      detail: `Filed within a year of separating (${plural(365 + d, "day")} left), your claim can be effective from the day after you separated.`,
      deadline: true,
    };
  }

  // 5. The window opens soon: get ready.
  if (vaOpen && d > 180 && d <= 210) {
    return {
      href: VA_TOOL,
      label: "Get ready for your VA claim",
      detail: `Your pre-discharge window (BDD) opens in ${plural(d - 180, "day")}, 180 days before your date. Use the time to gather records and know what you will claim.`,
      deadline: true,
    };
  }

  return null;
}

/** The next step on the resume path, for when nothing is time-critical. */
export function pipelineStep(profileExists: boolean, hasSourceDocuments: boolean, hasMasterResume: boolean, hasTargetedResume: boolean): NextStep {
  if (!profileExists) return { href: "/app/profile", label: "Complete your profile" };
  if (!hasSourceDocuments) return { href: "/app/documents", label: "Upload your military records" };
  if (!hasMasterResume) return { href: "/app/tools/fitrep-bullets", label: "Build your master resume" };
  if (!hasTargetedResume) return { href: "/app/tools/resume-targeter", label: "Build a resume for a real job" };
  return { href: "/app/library", label: "Review your saved work" };
}
