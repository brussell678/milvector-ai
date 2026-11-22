import { describe, expect, it } from "vitest";
import { SBP_TASK, VA_CLAIM_TASK, deadlineStep, pipelineStep } from "@/lib/next-step";

const none = new Set<string>();
const label = (days: number | null, done: ReadonlySet<string> = none) => deadlineStep(days, done)?.label ?? null;

describe("deadlineStep", () => {
  it("is quiet far from the date and without one", () => {
    expect(label(null)).toBeNull();
    expect(label(400)).toBeNull();
    expect(label(211)).toBeNull();
    expect(label(-365)).toBeNull();
  });

  it("gets the member ready in the 30 days before the VA window opens", () => {
    expect(label(210)).toBe("Get ready for your VA claim");
    expect(label(181)).toBe("Get ready for your VA claim");
    expect(deadlineStep(200, none)?.detail).toContain("opens in 20 days");
  });

  it("puts the VA claim first while its pre-discharge window is open, 180 to 90 days", () => {
    expect(label(180)).toBe("File your VA claim");
    expect(label(120)).toBe("File your VA claim");
    expect(label(90)).toBe("File your VA claim");
    expect(deadlineStep(91, none)?.detail).toContain("closes in 1 day.");
    expect(deadlineStep(150, none)?.href).toBe("/app/tools/va-rating-navigator");
  });

  it("moves to SBP once the VA claim is checked off, from 120 days to the date", () => {
    const vaDone = new Set([VA_CLAIM_TASK]);
    expect(label(120, vaDone)).toBe("Make your SBP decision");
    expect(label(121, vaDone)).toBeNull();
    expect(label(0, vaDone)).toBe("Make your SBP decision");
    expect(deadlineStep(60, vaDone)?.href).toBe("/app/tools/sbp-advisor");
  });

  it("puts SBP ahead of a late VA claim inside 90 days, since SBP locks at retirement", () => {
    expect(label(89)).toBe("Make your SBP decision");
    expect(label(89, new Set([SBP_TASK]))).toBe("File your VA claim");
    expect(deadlineStep(30, new Set([SBP_TASK]))?.detail).toContain("can still file your claim before you separate");
  });

  it("after the date, keeps the VA claim for a year with the days left", () => {
    expect(label(-1)).toBe("File your VA claim");
    expect(deadlineStep(-1, none)?.detail).toContain("364 days left");
    expect(label(-364)).toBe("File your VA claim");
    expect(label(-10, new Set([SBP_TASK]))).toBe("File your VA claim");
  });

  it("goes quiet once both are checked off", () => {
    const both = new Set([VA_CLAIM_TASK, SBP_TASK]);
    for (const d of [200, 150, 100, 30, 0, -30]) expect(label(d, both), String(d)).toBeNull();
  });

  it("marks these steps as deadlines", () => {
    expect(deadlineStep(150, none)?.deadline).toBe(true);
  });
});

describe("pipelineStep", () => {
  it("walks the resume path in order", () => {
    expect(pipelineStep(false, false, false, false).href).toBe("/app/profile");
    expect(pipelineStep(true, false, false, false).href).toBe("/app/documents");
    expect(pipelineStep(true, true, false, false).href).toBe("/app/tools/fitrep-bullets");
    expect(pipelineStep(true, true, true, false).href).toBe("/app/tools/resume-targeter");
    expect(pipelineStep(true, true, true, true).href).toBe("/app/library");
  });
});
