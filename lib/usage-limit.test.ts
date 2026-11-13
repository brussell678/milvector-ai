import { describe, expect, it } from "vitest";
import { evaluateUsage, usageLimitMessage } from "@/lib/usage-limit";

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
    expect(message).not.toMatch(/[–—]/);
  });
});
