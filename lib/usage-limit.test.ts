import { describe, expect, it } from "vitest";
import { evaluateUsage, runBudget, usageLimitMessage, vaLimitMessage } from "@/lib/usage-limit";
import { chatLimitFor, chatLimitMessage } from "@/lib/chat/limit";

describe("evaluateUsage", () => {
  it("allows a run below the limit and reports what is left", () => {
    expect(evaluateUsage(59, 60)).toEqual({ allowed: true, used: 59, limit: 60, remaining: 1 });
  });

  it("blocks at the limit, not one past it", () => {
    expect(evaluateUsage(60, 60).allowed).toBe(false);
    expect(evaluateUsage(60, 60).remaining).toBe(0);
  });

  it("never reports negative remaining", () => {
    expect(evaluateUsage(500, 60).remaining).toBe(0);
  });

  it("treats a bad count as zero rather than blocking", () => {
    expect(evaluateUsage(-3, 60).allowed).toBe(true);
  });
});

describe("usageLimitMessage", () => {
  it("names the limit and avoids dashes", () => {
    const message = usageLimitMessage(60);
    expect(message).toContain("60");
    expect(message).not.toMatch(/[\u2013\u2014]/);
  });
});

describe("run budgets (D18)", () => {
  it("counts the VA Navigator's runs on their own", () => {
    expect(runBudget("va_rating_navigator")).toEqual({ tool: "va_rating_navigator", excluded: [], limit: "VA_DAILY_RUN_LIMIT" });
  });

  it("counts every other tool's runs together, leaving the VA runs out", () => {
    expect(runBudget("targeted_resume")).toEqual({ tool: null, excluded: ["va_rating_navigator"], limit: "AI_DAILY_RUN_LIMIT" });
    expect(runBudget(undefined)).toEqual({ tool: null, excluded: ["va_rating_navigator"], limit: "AI_DAILY_RUN_LIMIT" });
  });

  it("says plainly what ran out, with no dashes", () => {
    expect(vaLimitMessage(150)).toContain("150 VA analyses and code lookups");
    expect(vaLimitMessage(150)).not.toMatch(/[\u2014\u2013]/);
  });
});

describe("follow-up budgets (D17)", () => {
  const env = { CHAT_DAILY_MESSAGE_LIMIT: 100, CHAT_VA_DAILY_MESSAGE_LIMIT: 300 };
  it("gives the VA chat its own, larger budget", () => {
    expect(chatLimitFor("va_rating_navigator", env)).toBe(300);
    expect(chatLimitFor("mos_translator", env)).toBe(100);
    expect(chatLimitFor("resume_targeter", env)).toBe(100);
    expect(chatLimitMessage(300)).toContain("this chat's daily limit");
  });
});
