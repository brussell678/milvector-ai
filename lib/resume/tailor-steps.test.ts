import { describe, expect, it } from "vitest";
import { samplingFor } from "@/lib/llm/client";
import { recordFromMaster } from "@/lib/resume/master-record";
import { addRoles, assembleTailored, closeSlots, mergeRewrites, planSlots, restoredSlots, rewriteRows, sameness, verifyProblems } from "@/lib/resume/targeting";

// The two-step tailoring path: a plan of line ids, numbered slots for the
// rewrite, and the rewrites back into a draft the checks read.

const MASTER = `Founder | RIG
Jan 2026 - Present
Built a platform for small businesses.
Wrote product requirements for an offline maintenance assistant.

Battalion Maintenance Officer | 2d LAR
Oct 2023 - Present
Designed a Power BI readiness system.
The system cut weekly briefing preparation from 6 hours to 2.
Coached personnel through implementation and sustained adoption.

Maintenance Officer | PM LAV
Jun 2022 - Oct 2023
Led integrated product team activities.`;

const raw = {
  roles: [
    { title: "Founder", organization: "RIG", start: "Jan 2026", end: "Present", lines: ["Built a platform for small businesses.", "Wrote product requirements for an offline maintenance assistant."] },
    {
      title: "Battalion Maintenance Officer",
      organization: "2d LAR",
      start: "Oct 2023",
      end: "Present",
      lines: ["Designed a Power BI readiness system.", "The system cut weekly briefing preparation from 6 hours to 2.", "Coached personnel through implementation and sustained adoption."],
    },
    { title: "Maintenance Officer", organization: "PM LAV", start: "Jun 2022", end: "Oct 2023", lines: ["Led integrated product team activities."] },
  ],
};
const { record } = recordFromMaster({ raw, masterText: MASTER, source: { documentId: "d", filename: "m.docx", docType: "MASTER_RESUME" }, builtAt: "2026-11-20T00:00:00Z" });

describe("a plan becomes numbered slots", () => {
  const plan = {
    highlights: [{ heading: "Selected Build Outcomes", bullets: [["ACC-02-01", "ACC-02-02"], ["ACC-01-02"]] }],
    experience: [
      // ACC-02-01 is already in a highlight; ACC-01-01 belongs to another job.
      { role_id: "ROLE-02", bullets: [["ACC-02-01"], ["ACC-02-03", "ACC-01-01"]] },
      { role_id: "ROLE-01", bullets: [["ACC-01-01"]] },
    ],
  };
  const layout = planSlots(plan, record);

  it("joins lines of one job into one slot, and never uses a line twice", () => {
    expect(layout.slots.map((s) => s.ids)).toEqual([["ACC-02-01", "ACC-02-02"], ["ACC-01-02"], ["ACC-02-03"], ["ACC-01-01"]]);
    expect(layout.highlights[0].slots).toEqual(["S1", "S2"]);
    expect(layout.experience.map((e) => [e.roleId, e.slots])).toEqual([
      ["ROLE-02", ["S3"]],
      ["ROLE-01", ["S4"]],
    ]);
  });

  it("assembles rewrites into a draft, keeping the master's line where a rewrite is missing", () => {
    const draft = assembleTailored({ ...plan, target_title: "Analyst", summary: [] }, layout, { bullets: [{ slot: "S1", text: "Cut weekly briefing preparation from 6 hours to 2 with a Power BI readiness system." }] });
    const highlights = draft.highlights as { bullets: { text: string; evidence: string[] }[] }[];
    expect(highlights[0].bullets[0]).toEqual({ text: "Cut weekly briefing preparation from 6 hours to 2 with a Power BI readiness system.", evidence: ["ACC-02-01", "ACC-02-02"] });
    expect(highlights[0].bullets[1].text).toBe("Wrote product requirements for an offline maintenance assistant.");
    expect(draft.target_title).toBe("Analyst");
  });

  it("adds a skipped job with its first lines, so it is tailored with the rest", () => {
    const withGap = addRoles(layout, record, ["ROLE-03"]);
    expect(withGap.experience.at(-1)).toEqual({ roleId: "ROLE-03", slots: ["S5"] });
    expect(withGap.slots.at(-1)?.lines).toEqual(["Led integrated product team activities."]);
  });
});

describe("one more try at the bullets that need it", () => {
  const layout = planSlots({ experience: [{ role_id: "ROLE-02", bullets: [["ACC-02-03"]] }, { role_id: "ROLE-03", bullets: [["ACC-03-01"]] }] }, record);

  it("measures how much wording a rewrite kept", () => {
    expect(sameness("Coached personnel through implementation and sustained adoption.", "Coached personnel through implementation and sustained adoption.")).toBe(1);
    expect(sameness("Sustained adoption by coaching teams through each rollout.", "Coached personnel through implementation and sustained adoption.")).toBeLessThan(0.6);
  });

  it("sends back a rewrite that barely changed its line, with the reason", () => {
    const close = closeSlots(layout, [
      { slot: "S1", text: "Coached personnel through implementation and sustained the adoption." },
      { slot: "S2", text: "Held the cadence of cross-functional product teams as their lead." },
    ]);
    expect(close.map((c) => c.slot)).toEqual(["S1"]);
    expect(close[0].problem).toMatch(/nearly the same wording/);
  });

  it("finds the slot of a bullet a check put back, with what was tried", () => {
    const resume = {
      highlights: [],
      experience: [
        {
          roleId: "ROLE-03",
          title: "",
          organization: "",
          dates: "",
          bullets: [{ text: "Led integrated product team activities.", evidence: ["ACC-03-01"], restored: true, tried: { text: "Owned the program's product teams.", evidence: ["ACC-03-01"], why: "changed what the master line it cites says you did: owned" } }],
        },
      ],
    };
    expect(restoredSlots(resume, layout)).toMatchObject([{ slot: "S2", previous: "Owned the program's product teams.", problem: /owned/ }]);
  });

  it("lets a later rewrite replace an earlier one, slot by slot", () => {
    const first = rewriteRows({ bullets: [{ slot: "S1", text: "a" }, { slot: "S2", text: "b" }] });
    expect(mergeRewrites(first, { bullets: [{ slot: "S2", text: "c" }] })).toEqual([
      { slot: "S1", text: "a" },
      { slot: "S2", text: "c" },
    ]);
  });

  it("reads the verification answer as the slots it found unsupported", () => {
    const problems = verifyProblems({ checks: [{ slot: "S1", ok: true }, { slot: "S2", ok: false, problem: "adds 'for commercial clients'" }] });
    expect([...problems]).toEqual([["S2", "adds 'for commercial clients'"]]);
  });
});

describe("model settings", () => {
  it("sends a temperature to older models and none to reasoning models, which reject it", () => {
    expect(samplingFor("gpt-4.1", 0.2)).toEqual({ temperature: 0.2 });
    expect(samplingFor("gpt-5.5", 0.2)).toEqual({});
    expect(samplingFor("o3", 0)).toEqual({});
    expect(samplingFor("gpt-6.2-sol", 0.2, "medium")).toEqual({ reasoning: { effort: "medium" } });
    expect(samplingFor("gpt-4.1", 0.2, "medium")).toEqual({ temperature: 0.2 });
  });
});
