import { describe, expect, it } from "vitest";
import { bannedPhrases, cleanPunctuation, duplicateIndexes, extractNumbers, overlap, unsupportedCredentials, ungroundedNumbers } from "@/lib/resume/gates";
import { estimatePages } from "@/lib/resume/layout";
import { dateValue, sortRoles } from "@/lib/resume/record";

describe("figures", () => {
  it("normalizes money and magnitudes so the same figure compares equal", () => {
    expect(extractNumbers("$2.3M budget")).toContain("2300000");
    expect(extractNumbers("2.3 million dollars")).toContain("2300000");
    expect(extractNumbers("2,300,000 in assets")).toContain("2300000");
    expect(extractNumbers("cut by 12%")).toContain("12");
    expect(extractNumbers("45k items")).toContain("45000");
  });

  it("passes a bullet whose figures are in the source", () => {
    const source = "Supervised 42 Marines and maintained 118 vehicles valued at $14.2M with a 96 percent readiness rate.";
    expect(ungroundedNumbers("Led a 42-person team sustaining 118 vehicles worth $14.2 million at 96% readiness", source)).toEqual([]);
  });

  it("catches a figure that is not in the source", () => {
    const source = "Supervised 42 Marines and maintained 118 vehicles.";
    expect(ungroundedNumbers("Led 42 personnel and cut costs by 30 percent", source)).toEqual(["30"]);
  });

  it("catches a figure that was rounded up", () => {
    expect(ungroundedNumbers("Managed a $15M inventory", "inventory valued at $14.2M")).toEqual(["15000000"]);
  });

  it("accepts a number the source spells out, and years it is told are dates", () => {
    expect(ungroundedNumbers("Trained 12 instructors", "trained twelve instructors")).toEqual([]);
    expect(ungroundedNumbers("Selected as top performer in 2021", "ranked first of peers", ["2021"])).toEqual([]);
  });

  it("does not treat one or two as a claim", () => {
    expect(ungroundedNumbers("One of two officers selected", "selected for the program")).toEqual([]);
  });
});

describe("guarded credentials", () => {
  it("flags a clearance the record does not show", () => {
    expect(unsupportedCredentials("Holds an active Top Secret clearance", "Bachelor of Science, 2015")).toContain("Top Secret clearance");
    expect(unsupportedCredentials("Active Secret clearance", "Secret security clearance")).toEqual([]);
  });

  it("flags degrees and certifications the record does not show", () => {
    const support = "Associate of Arts, 2012; Lean Six Sigma Green Belt";
    expect(unsupportedCredentials("MBA-level leader with PMP and Six Sigma", support).sort()).toEqual(["PMP", "master's degree"].sort());
    expect(unsupportedCredentials("PMP-certified, Bachelor of Science", "Project Management Professional (PMP); B.S. Organizational Leadership")).toEqual([]);
  });

  it("does not fire on ordinary words", () => {
    expect(unsupportedCredentials("Managed program schedules and mastered complex logistics", "")).toEqual([]);
    expect(unsupportedCredentials("Associate-level coordination with partner units", "")).toEqual([]);
  });
});

describe("language", () => {
  it("finds filler phrases", () => {
    expect(bannedPhrases("Results-driven team player with a proven track record")).toEqual(["proven track record", "results-driven", "team player"]);
    expect(bannedPhrases("Led maintenance operations for a 300-person battalion")).toEqual([]);
  });

  it("replaces dashes and smart quotes", () => {
    expect(cleanPunctuation("Led 42 Marines — the largest section – through deployment")).toBe("Led 42 Marines, the largest section, through deployment");
    expect(cleanPunctuation("the unit’s “best” year")).toBe("the unit's \"best\" year");
  });
});

describe("repetition", () => {
  const a = "Reduced engine repair cycle time from 120 to 56 days through workflow redesign and coaching";
  const b = "Cut the engine repair cycle from 120 days to 56 days by redesigning workflow and coaching technicians";
  const c = "Coordinated 300 personnel across seven countries to rebuild a disrupted forward supply chain";

  it("scores a restated bullet high and a different one low", () => {
    expect(overlap(a, b)).toBeGreaterThanOrEqual(0.72);
    expect(overlap(a, c)).toBeLessThan(0.3);
  });

  it("marks the later copy, not the first", () => {
    expect(duplicateIndexes([a, c, b])).toEqual([2]);
    expect(duplicateIndexes([a, c])).toEqual([]);
  });
});

describe("record dates", () => {
  it("orders roles most recent first, with Present on top", () => {
    const roles = sortRoles([
      { start: "Jun 2015", end: "May 2018" },
      { start: "Oct 2023", end: "Present" },
      { start: "Jun 2018", end: "Sep 2023" },
    ]);
    expect(roles.map((r) => r.end)).toEqual(["Present", "Sep 2023", "May 2018"]);
  });

  it("reads month and year, year alone, and unknown", () => {
    expect(dateValue("Mar 2021")).toBe(202103);
    expect(dateValue("2021")).toBe(202100);
    expect(dateValue("")).toBe(0);
  });
});

describe("page estimate", () => {
  const bullet = "Directed maintenance operations for a 300-person battalion, sustaining 118 vehicles at 96 percent readiness across two deployments.";
  const build = (roles: number, bullets: number) =>
    estimatePages({
      hasTitleLine: true,
      contactLines: 2,
      summary: "x".repeat(420),
      skillsLine: "x".repeat(260),
      roles: Array.from({ length: roles }, () => ({ bullets: Array(bullets).fill(bullet) })),
      educationItems: 6,
      educationGroups: 3,
    });

  it("grows with content", () => {
    expect(build(5, 5)).toBeGreaterThan(build(3, 3));
  });

  it("puts a typical three-role resume near one page and a full career near two", () => {
    expect(build(3, 4)).toBeGreaterThan(0.6);
    expect(build(3, 4)).toBeLessThan(1.2);
    expect(build(6, 5)).toBeGreaterThan(1.5);
    expect(build(6, 5)).toBeLessThan(2.4);
  });
});

import { unsupportedAcronyms } from "@/lib/resume/gates";
import { normalizeDate } from "@/lib/resume/record";

describe("unsupported terms", () => {
  const evidence = "Authored the battalion maintenance standard operating procedure. Completed 1,150 work orders with a 97% on-time rate.";

  it("catches a posting keyword the evidence never mentions", () => {
    expect(unsupportedAcronyms("Completed 1,150 work orders with CMMS utilization", evidence)).toEqual(["CMMS"]);
    expect(unsupportedAcronyms("Ensured DOT compliance across the fleet", evidence)).toEqual(["DOT"]);
  });

  it("accepts an acronym the evidence spells out or contains", () => {
    expect(unsupportedAcronyms("Authored SOPs adopted across the battalion", evidence)).toEqual([]);
    expect(unsupportedAcronyms("Passed the FSMAO inspection", "zero discrepancies on the FSMAO inspection")).toEqual([]);
  });

  it("ignores everyday acronyms and ordinary capitalized words", () => {
    expect(unsupportedAcronyms("Reported KPIs to HR and IT leadership in the US", evidence)).toEqual([]);
    expect(unsupportedAcronyms("Led Maintenance Operations for the Battalion", evidence)).toEqual([]);
  });
});

describe("normalizeDate", () => {
  it("brings every format the records use to one display form", () => {
    expect(normalizeDate("20230701")).toBe("Jul 2023");
    expect(normalizeDate("2023-07")).toBe("Jul 2023");
    expect(normalizeDate("2023-07-15")).toBe("Jul 2023");
    expect(normalizeDate("07/2023")).toBe("Jul 2023");
    expect(normalizeDate("June 2021")).toBe("Jun 2021");
    expect(normalizeDate("2019")).toBe("2019");
    expect(normalizeDate("present")).toBe("Present");
    expect(normalizeDate("unknown")).toBe("");
  });
});
