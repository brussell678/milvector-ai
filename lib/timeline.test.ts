import { describe, expect, it } from "vitest";
import { PHASE_LABEL, TIMELINE_MARKERS, phaseFromDays, phaseSentence } from "@/lib/timeline";

describe("timeline phase names", () => {
  it("names every Timeline marker", () => {
    for (const month of TIMELINE_MARKERS) expect(PHASE_LABEL[month], String(month)).toBeTruthy();
  });

  it("uses the Timeline's names on the workspace home", () => {
    expect(phaseFromDays(null)).toBe("24 Months");
    expect(phaseFromDays(600)).toBe("24 Months");
    expect(phaseFromDays(150)).toBe("6 Months");
    expect(phaseFromDays(10)).toBe("Final Approach");
    expect(phaseFromDays(0)).toBe("Final Approach");
  });

  it("reads as a sentence, and says nothing without a date", () => {
    expect(phaseSentence(150)).toBe("You're in the 6-month phase of your Timeline.");
    expect(phaseSentence(400)).toBe("You're in the 18-month phase of your Timeline.");
    expect(phaseSentence(10)).toBe("You're on final approach.");
    expect(phaseSentence(null)).toBe("");
  });
});
