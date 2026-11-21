import { describe, expect, it } from "vitest";
import { gateTargetedResume } from "@/lib/resume/build";
import { addedTerms, inflatedClaims } from "@/lib/resume/gates";
import { estimatePages } from "@/lib/resume/layout";
import { recordFromMaster } from "@/lib/resume/master-record";
import { figureChecks, unusedLines } from "@/lib/resume/targeting";
import { buildTargetedResumeText } from "@/lib/resume-template";

// Tailoring: every line may be rewritten toward the posting, but the facts of
// the master line it cites are fixed. A rewrite that changes one is replaced
// by the master's own line.

const MASTER = `Battalion Maintenance Officer | 2d LAR
Oct 2023 - Present
Designed a Power BI readiness system that cut total preparation from 35.5 hours per cycle to 13.5, roughly 62 percent.
Fleet-side contributor to the Condition-Based Maintenance Plus team; helped shape the 2021 concept of operations.
Trained counterparts in other units to adopt and sustain the readiness product.
Coached personnel through implementation and sustained adoption.

Maintenance Officer | PM LAV
Jun 2022 - Oct 2023
Translated lifecycle strategy and performance data into decision-ready recommendations for program leadership.
Led integrated product team activities, working distributed for roughly 80 percent of the assignment.`;

const raw = {
  roles: [
    {
      title: "Battalion Maintenance Officer",
      organization: "2d LAR",
      start: "Oct 2023",
      end: "Present",
      lines: [
        "Designed a Power BI readiness system that cut total preparation from 35.5 hours per cycle to 13.5, roughly 62 percent.",
        "Fleet-side contributor to the Condition-Based Maintenance Plus team; helped shape the 2021 concept of operations.",
        "Trained counterparts in other units to adopt and sustain the readiness product.",
        "Coached personnel through implementation and sustained adoption.",
      ],
    },
    {
      title: "Maintenance Officer",
      organization: "PM LAV",
      start: "Jun 2022",
      end: "Oct 2023",
      lines: [
        "Translated lifecycle strategy and performance data into decision-ready recommendations for program leadership.",
        "Led integrated product team activities, working distributed for roughly 80 percent of the assignment.",
      ],
    },
  ],
};
const source = { documentId: "doc", filename: "master.docx", docType: "MASTER_RESUME" };
const { record } = recordFromMaster({ raw, masterText: MASTER, source, builtAt: "2026-11-20T00:00:00Z" });
const line = (id: string) => record.roles.flatMap((r) => r.accomplishments).find((a) => a.id === id)!.text;

describe("claim level: a rewrite keeps the master's ownership, reach, and rank", () => {
  it("flags an ownership verb the cited line does not use", () => {
    expect(inflatedClaims("Led the Condition-Based Maintenance Plus concept.", line("ACC-01-02"))).toEqual(["led"]);
    expect(inflatedClaims("Contributed to the Condition-Based Maintenance Plus concept of operations.", line("ACC-01-02"))).toEqual([]);
    expect(inflatedClaims("Built and designed a readiness system.", line("ACC-01-01"))).toEqual(["built"]);
  });

  it("flags reach and rank the cited line never states", () => {
    expect(inflatedClaims("Drove enterprise-wide AI adoption.", "Coached personnel through adoption.")).toEqual(["enterprise"]);
    expect(inflatedClaims("Delivered the first readiness product of its kind.", line("ACC-01-01"))).toEqual(["first"]);
    expect(inflatedClaims("Advised international partners.", "Advised multinational partners.")).toEqual([]);
  });
});

describe("added terms: posting words a rewrite brings that its master line lacks", () => {
  const posting = "Drive AI adoption with engineering teams and stakeholders. Measure adoption and uptime across the fleet.";

  it("counts posting words the line never used, but not civilian words for what it already has", () => {
    expect(addedTerms("Trained counterparts, including engineering teams, to adopt the readiness product.", line("ACC-01-03"), posting)).toEqual(["engineering"]);
    expect(addedTerms("Coached personnel and stakeholders through implementation.", line("ACC-01-04"), posting)).toEqual([]);
  });

  it("treats a word's family and a civilian term for the line's own word as no addition", () => {
    // "adoption" is the line's "adopt"; "uptime" is its "readiness".
    expect(addedTerms("Drove adoption and uptime of the readiness product across other units.", line("ACC-01-03"), posting)).toEqual([]);
  });

  it("puts the master line back when a rewrite adds three or more, and marks fewer for the member", () => {
    const raw = {
      experience: [
        {
          role_id: "ROLE-01",
          bullets: [
            { text: "Coached engineering teams through fleet uptime measurement and sustained adoption.", evidence: ["ACC-01-04"] },
            { text: "Trained counterparts in other units to adopt and sustain the readiness product, measuring adoption.", evidence: ["ACC-01-03"] },
          ],
        },
      ],
    };
    const { resume, findings } = gateTargetedResume({ raw, record, titlesFromRecord: true, postingText: posting });
    const [first, second] = resume.experience[0].bullets;
    expect(first).toMatchObject({ text: line("ACC-01-04"), restored: true });
    expect(second.added).toEqual(["measuring"]);
    expect(second.restored).toBeUndefined();
    expect(findings.find((f) => f.gate === "claims")?.detail).toMatch(/added .*engineering/);
  });
});

describe("a tailored resume with highlights", () => {
  const draft = {
    target_title: "AI Deployment Manager",
    tagline: "AI Deployment | Salesforce Enablement | Measured Adoption",
    summary: "Deployment leader who gets new tools adopted and measured.",
    skills: ["Change Management", "Adoption Measurement"],
    highlights: [
      {
        heading: "Selected Build Outcomes",
        bullets: [
          // Tailored, facts kept: passes.
          { text: "Designed a Power BI readiness product that cut preparation from 35.5 hours per cycle to 13.5, roughly 62 percent.", evidence: ["ACC-01-01"] },
          // Evidence from another role is fine in a highlight.
          { text: "Led integrated product teams while working distributed for roughly 80 percent of the assignment.", evidence: ["ACC-02-02"] },
        ],
      },
      {
        heading: "Selected Enablement Outcomes",
        bullets: [
          // Ownership upgraded: contributor became led. The master line goes back.
          { text: "Led the Condition-Based Maintenance Plus concept of operations for the fleet.", evidence: ["ACC-01-02"] },
          // A reach the master never states: the master line goes back.
          { text: "Drove enterprise-wide adoption by training counterparts across units.", evidence: ["ACC-01-03"] },
        ],
      },
    ],
    experience: [
      {
        role_id: "ROLE-01",
        bullets: [
          // Already told in a highlight: removed here.
          { text: "Cut readiness preparation from 35.5 hours to 13.5 with a Power BI system.", evidence: ["ACC-01-01"] },
          { text: "Coached teams through implementation until the new practice held.", evidence: ["ACC-01-04"] },
        ],
      },
      { role_id: "ROLE-02", bullets: [{ text: "Turned lifecycle strategy and performance data into decision-ready recommendations for program leaders.", evidence: ["ACC-02-01"] }] },
    ],
  };
  const { resume, findings } = gateTargetedResume({ raw: draft, record, titlesFromRecord: true });
  const group = (n: number) => resume.highlights[n].bullets;

  it("keeps a tailored highlight whose facts match, from any role", () => {
    expect(group(0).map((b) => b.restored ?? false)).toEqual([false, false]);
    expect(group(0)[1].evidence).toEqual(["ACC-02-02"]);
  });

  it("puts the master's own line back when a rewrite claims more", () => {
    expect(group(1).map((b) => b.text)).toEqual([line("ACC-01-02"), line("ACC-01-03")]);
    expect(group(1).every((b) => b.restored)).toBe(true);
    const claims = findings.find((f) => f.gate === "claims");
    expect(claims?.level).toBe("warn");
    expect(claims?.detail).toMatch(/2 tailored line\(s\) changed what the master line it cites says you did .*led.*enterprise/);
  });

  it("puts the master's own line back when a rewrite weakens what the candidate led", () => {
    const weakened = gateTargetedResume({
      raw: { experience: [{ role_id: "ROLE-02", bullets: [{ text: "Contributed to integrated product team activities while working distributed for roughly 80 percent of the assignment.", evidence: ["ACC-02-02"] }] }] },
      record,
      titlesFromRecord: true,
    });
    expect(weakened.resume.experience[0].bullets[0]).toMatchObject({ text: line("ACC-02-02"), restored: true });
    expect(weakened.resume.experience[0].bullets[0].tried?.why).toMatch(/weakened "led"/);
  });

  it("does not repeat a highlight under the job", () => {
    expect(resume.experience[0].bullets.map((b) => b.evidence[0])).toEqual(["ACC-01-04"]);
    expect(findings.find((f) => f.check === "No achievement stated twice")?.detail).toMatch(/Removed 1/);
  });

  it("drops a tagline theme naming a tool the master never mentions", () => {
    expect(resume.tagline).toBe("AI Deployment | Measured Adoption");
  });

  it("lists highlight figures on the checklist, under the highlight's heading", () => {
    const checks = figureChecks(resume, record);
    expect(checks.map((c) => c.place)).toContain("Selected Build Outcomes");
    expect(checks.find((c) => c.place === "Selected Build Outcomes")?.sources[0]).toBe(line("ACC-01-01"));
  });

  it("treats lines used in a highlight as used, so a top-up does not offer them again", () => {
    const unused = unusedLines(record, draft);
    expect(unused).not.toContain("ACC-01-01 |");
    expect(unused).not.toContain("ACC-02-02 |");
  });

  it("prints the tagline and each highlight in capitals, after the core expertise", () => {
    const text = buildTargetedResumeText({
      contact: { full_name: "Jordan Reyes" },
      resume: {
        target_title: resume.targetTitle,
        tagline: resume.tagline,
        executive_summary: resume.summary,
        core_skills: resume.skills,
        highlights: resume.highlights.map((g) => ({ heading: g.heading, bullets: g.bullets.map((b) => b.text) })),
        experience: [],
        off_duty_education: [],
        civilian_certifications: [],
        additional_training: [],
      },
    });
    expect(text).toMatch(/^Jordan Reyes\nAI Deployment Manager\nAI DEPLOYMENT \| MEASURED ADOPTION/);
    expect(text.indexOf("CORE EXPERTISE")).toBeLessThan(text.indexOf("SELECTED BUILD OUTCOMES"));
    expect(text).toContain("SELECTED ENABLEMENT OUTCOMES\n- " + line("ACC-01-02"));
  });

  it("counts the highlights in the page estimate", () => {
    const base = { hasTitleLine: true, contactLines: 2, summary: "x".repeat(300), skillsLine: "y".repeat(150), roles: [{ bullets: ["z".repeat(150)] }], educationItems: 2, educationGroups: 1 };
    expect(estimatePages({ ...base, hasTagline: true, highlights: [{ bullets: ["w".repeat(150), "w".repeat(150)] }] })).toBeGreaterThan(estimatePages(base));
  });
});
