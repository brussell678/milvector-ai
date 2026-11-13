import { describe, expect, it } from "vitest";
import { allowedRatings, codeContext, codeIndexText, dbqForms, getCode, isValidCode, SCHEDULE_AS_OF } from "@/lib/va/schedule";

// These guard the parsed regulation data. If a rebuild from a newer eCFR
// issue changes one of them, check the Federal Register before updating the
// expectation: the schedule itself may have been amended.

describe("VA rating schedule data", () => {
  it("carries an as-of date", () => {
    expect(SCHEDULE_AS_OF).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("knows common codes by their regulation titles", () => {
    expect(getCode("9411")?.title).toMatch(/Posttraumatic stress disorder/i);
    expect(getCode("6847")?.title).toMatch(/Sleep Apnea/i);
    expect(getCode("6260")?.title).toMatch(/Tinnitus/i);
    expect(getCode("8100")?.title).toMatch(/Migraine/i);
    expect(getCode("5237")?.title).toMatch(/strain/i);
    expect(getCode("6100")?.title).toMatch(/Hearing/i);
  });

  it("rejects codes that are not in the schedule", () => {
    expect(isValidCode("0000")).toBe(false);
    expect(isValidCode("9999")).toBe(false);
    expect(codeContext("9999")).toBeNull();
  });

  it("reads rating tiers straight from a code's own criteria", () => {
    expect(allowedRatings("6260")).toEqual([10]);
    expect(allowedRatings("8100")).toEqual([0, 10, 30, 50]);
    expect(allowedRatings("6847")).toEqual([0, 30, 50, 100]);
  });

  it("applies the mental disorders formula to codes listed in prose", () => {
    expect(allowedRatings("9411")).toEqual([0, 10, 30, 50, 70, 100]);
    expect(codeContext("9411")).toMatch(/GENERAL RATING FORMULA FOR MENTAL DISORDERS/);
    expect(codeContext("9411")).toMatch(/Occupational and social impairment/i);
  });

  it("applies the spine formula to spine codes and not the eating disorders formula to PTSD", () => {
    expect(allowedRatings("5237")).toContain(40);
    expect(codeContext("5237")).toMatch(/Forward flexion/i);
    expect(codeContext("9411")).not.toMatch(/EATING DISORDERS/);
  });

  it("limits a ranged formula to the codes it names", () => {
    // Sinusitis formula covers 6510 through 6514, not rhinitis (6522)
    expect(codeContext("6513")).toMatch(/SINUSITIS/);
    expect(codeContext("6522")).not.toMatch(/GENERAL RATING FORMULA FOR SINUSITIS/);
  });

  it("pulls in shared criteria for codes rated by reference", () => {
    // 7512 chronic cystitis: "Rate as voiding dysfunction" lives in 4.115a
    expect(codeContext("7512")).toMatch(/SHARED CRITERIA, 38 CFR 4\.115a/);
  });

  it("builds an index of every code and a DBQ list", () => {
    expect(codeIndexText().split("\n").length).toBeGreaterThan(650);
    expect(dbqForms().length).toBeGreaterThan(50);
    expect(dbqForms().every((form) => form.url.startsWith("https://www.benefits.va.gov/"))).toBe(true);
  });
});
