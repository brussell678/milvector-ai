import { describe, expect, it } from "vitest";
import { applyCorrections, findLine, replaceLine } from "@/lib/resume/corrections";

describe("corrections from the review step", () => {
  const master = `Battalion Maintenance Officer | 2d LAR
Designed a Power BI readiness system that cut preparation
from 35.5 hours per cycle to 2.5.
Coached personnel through sustained adoption.`;

  it("finds a master line across the wraps a Word file's text carries", () => {
    expect(findLine(master, "Designed a Power BI readiness system that cut preparation from 35.5 hours per cycle to 2.5.")).not.toBeNull();
    expect(findLine(master, "Built a dashboard.")).toBeNull();
  });

  it("applies an open correction, and reports one the master already says as resolved", () => {
    const corrections = [
      { id: "a", kind: "outdated", old_line: "Designed a Power BI readiness system that cut preparation from 35.5 hours per cycle to 2.5.", new_line: "Designed a Power BI readiness system that cut total preparation from 35.5 hours per cycle to 13.5." },
      { id: "b", kind: "outdated", old_line: "Led a platoon of 40.", new_line: "Coached personnel through sustained adoption." },
      { id: "c", kind: "misstated", old_line: "Coached personnel through sustained adoption.", new_line: null },
    ];
    const out = applyCorrections(master, corrections);
    expect(out.text).toContain("to 13.5.");
    expect(out.text).not.toContain("to 2.5.");
    expect(out.applied).toEqual(["a"]);
    expect(out.resolved).toEqual(["b"]);
  });

  it("replaces a line in the printable resume and the checked resume, or a summary sentence", () => {
    const saved = {
      executive_summary: "Maintenance leader with 20 years. Cut preparation from 35.5 hours to 2.5.",
      experience: [{ role_title: "BMO", bullets: ["Cut preparation from 35.5 hours to 2.5.", "Coached personnel."] }],
      checked: { resume: { summary: "Maintenance leader with 20 years. Cut preparation from 35.5 hours to 2.5.", experience: [{ bullets: [{ text: "Cut preparation from 35.5 hours to 2.5.", evidence: ["ACC-01-01"] }] }] } },
    };
    const bullet = replaceLine(saved, "Cut preparation from 35.5 hours to 2.5.", "Cut total preparation from 35.5 hours to 13.5.");
    expect(bullet.found).toBe(true);
    expect(bullet.next.experience?.[0].bullets?.[0]).toBe("Cut total preparation from 35.5 hours to 13.5.");
    expect((bullet.next.checked?.resume?.experience?.[0].bullets?.[0] as { text: string }).text).toBe("Cut total preparation from 35.5 hours to 13.5.");
    // Only one place changes: the summary sentence with the same words stays until it is reviewed itself.
    expect(bullet.next.executive_summary).toContain("to 2.5.");
    const sentence = replaceLine({ executive_summary: "Maintenance leader with 20 years. Built teams." }, "Maintenance leader with 20 years.", "");
    expect(sentence.next.executive_summary).toBe("Built teams.");
    expect(replaceLine(saved, "Not in it.", "x").found).toBe(false);
  });
});
