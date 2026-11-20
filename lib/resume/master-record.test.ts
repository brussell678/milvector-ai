import { describe, expect, it } from "vitest";
import { gateTargetedResume } from "@/lib/resume/build";
import { comparable, recordFromMaster } from "@/lib/resume/master-record";

const MASTER = `BRANDON RUSSELL
ENTERPRISE AI TRANSFORMATION  |  ORGANIZATIONAL CHANGE

EXECUTIVE PROFILE
Enterprise transformation leader with 20 years of Marine Corps experience.

AREAS OF EXPERTISE
Change Strategy  |  Lean Six Sigma  |  Power BI

SELECTED ENTERPRISE IMPACT
Recognized by the inaugural USMC Innovation Award Board for a Power BI readiness brief.

PROFESSIONAL EXPERIENCE
Founder   |   Russell Innovation Group LLC
Sneads Ferry, North Carolina  Jan 2026 - Present
• Built an AI knowledge platform used by 3 pilot organizations.

Battalion Maintenance Officer   |   2d Light Armored Reconnaissance Battalion
Camp Lejeune, North Carolina  Oct 2023 - Present
• Led maintenance for a $120M fleet of 400 vehicles across 6 companies.
• Raised equipment readiness from 71% to 92% in 14 months.

Maintenance Officer   |   PM LAV
Warren, Michigan  Jun 2022 - Oct 2023
• Advised 9 units on obsolescence and sustainment.

EDUCATION AND PROFESSIONAL DEVELOPMENT
Master of Science, Management, 2019
Lean Six Sigma Green Belt
Active Secret Clearance`;

const raw = {
  summary: ["Enterprise transformation leader with 20 years of Marine Corps experience."],
  competencies: ["Change Strategy", "Lean Six Sigma", "Power BI"],
  roles: [
    { title: "Maintenance Officer", organization: "PM LAV", start: "Jun 2022", end: "Oct 2023", lines: ["• Advised 9 units on obsolescence and sustainment."] },
    {
      title: "Battalion Maintenance Officer",
      organization: "2d Light Armored Reconnaissance Battalion",
      start: "Oct 2023",
      end: "Present",
      lines: [
        "Led maintenance for a $120M fleet of 400 vehicles across 6 companies.",
        "Raised equipment readiness from 71% to 92% in 14 months.",
        // Reworded by the model: not in the master, so dropped.
        "Transformed readiness from 71% to 95% across the battalion.",
        // Repeated: kept once.
        "Led maintenance for a $120M fleet of 400 vehicles across 6 companies.",
      ],
    },
    { title: "Founder", organization: "Russell Innovation Group LLC", start: "Jan 2026", end: "Present", lines: ["Built an AI knowledge platform used by 3 pilot organizations."] },
    // A role the master does not have, with no verifiable lines: left out.
    { title: "Chief AI Officer", organization: "Acme", start: "2024", end: "Present", lines: ["Ran AI for 10,000 people."] },
  ],
  credentials: [
    { kind: "education", text: "Master of Science, Management, 2019" },
    { kind: "certification", text: "Lean Six Sigma Green Belt" },
    { kind: "clearance", text: "Active Secret Clearance" },
    { kind: "certification", text: "PMP" },
    { kind: "award", text: "Lean Six Sigma Green Belt" },
  ],
  unassigned: ["Recognized by the inaugural USMC Innovation Award Board for a Power BI readiness brief."],
};

const source = { documentId: "00000000-0000-4000-8000-0000000000aa", filename: "Brandon_Russell_Master_Resume_Baseline.docx", docType: "MASTER_RESUME" };
const built = recordFromMaster({ raw, masterText: MASTER, source, builtAt: "2026-11-20T00:00:00Z" });

describe("a master resume becomes a record, word for word", () => {
  it("keeps only lines that are in the master, each once", () => {
    const bmo = built.record.roles.find((r) => r.title === "Battalion Maintenance Officer")!;
    expect(bmo.accomplishments.map((a) => a.text)).toEqual([
      "Led maintenance for a $120M fleet of 400 vehicles across 6 companies.",
      "Raised equipment readiness from 71% to 92% in 14 months.",
    ]);
    expect(built.dropped).toContain("Transformed readiness from 71% to 95% across the battalion.");
    expect(built.dropped).toContain("Ran AI for 10,000 people.");
  });

  it("drops a role with nothing verifiable, and says what was left out", () => {
    expect(built.record.roles.some((r) => r.title === "Chief AI Officer")).toBe(false);
    expect(built.record.openQuestions.join(" ")).toMatch(/could not be matched word for word/);
  });

  it("strips bullet marks and evens out quotes and dashes before comparing", () => {
    expect(built.record.roles.find((r) => r.title === "Maintenance Officer")!.accomplishments[0].text).toBe("Advised 9 units on obsolescence and sustainment.");
    expect(comparable(`Oct 2023 ${String.fromCharCode(0x2013)} Present`)).toBe(comparable("Oct 2023 - Present"));
    expect(comparable("the member’s record")).toBe("the member's record");
  });

  it("orders roles newest first and assigns stable ids", () => {
    expect(built.record.roles.map((r) => `${r.id} ${r.title}`)).toEqual(["ROLE-01 Founder", "ROLE-02 Battalion Maintenance Officer", "ROLE-03 Maintenance Officer"]);
    expect(built.record.roles[1].accomplishments.map((a) => a.id)).toEqual(["ACC-02-01", "ACC-02-02"]);
    expect(built.record.roles[1].start).toBe("Oct 2023");
    expect(built.record.roles[1].end).toBe("Present");
  });

  it("treats every figure the member wrote as theirs", () => {
    const acc = built.record.roles[1].accomplishments[1];
    expect(acc.unverifiedNumbers).toEqual([]);
    expect(acc.verifiedNumbers.length).toBeGreaterThan(0);
    expect(acc.sources[0].filename).toBe("Brandon_Russell_Master_Resume_Baseline.docx");
  });

  it("keeps credentials that are in the master, with a known kind", () => {
    expect(built.record.credentials.map((c) => `${c.id} ${c.kind} ${c.text}`)).toEqual([
      "CRED-01 education Master of Science, Management, 2019",
      "CRED-02 certification Lean Six Sigma Green Belt",
      "CRED-03 clearance Active Secret Clearance",
    ]);
  });

  it("keeps the summary, competencies, and unassigned highlights as support text", () => {
    expect(built.support).toContain("20 years of Marine Corps experience");
    expect(built.support).toContain("Power BI");
    expect(built.support).toContain("inaugural USMC Innovation Award Board");
  });
});

describe("checking a targeted resume against the master", () => {
  const raw = {
    target_title: "Director of AI Transformation",
    summary: "Transformation leader with 20 years of Marine Corps experience, recognized by the USMC Innovation Award Board. Builds executive dashboards in Tableau.",
    skills: ["Change Strategy", "Power BI", "Tableau"],
    experience: [
      {
        role_id: "ROLE-02",
        title: "VP of Fleet Operations",
        bullets: [
          { text: "Raised equipment readiness from 71% to 92% in 14 months.", evidence: ["ACC-02-02"] },
          { text: "Raised readiness to 95% across 6 companies.", evidence: ["ACC-02-01"] },
          { text: "Built an AI platform for 3 pilot organizations.", evidence: ["ACC-01-01"] },
          // A posting's tool appended to a true accomplishment: removed (C4).
          { text: "Led maintenance for a $120M fleet tracked in Tableau.", evidence: ["ACC-02-01"] },
        ],
      },
    ],
    credential_ids: ["CRED-01"],
  };
  const { resume, findings } = gateTargetedResume({ raw, record: built.record, titlesFromRecord: true, extraSupport: built.support });

  it("keeps the master's own title, not one the model invented", () => {
    expect(resume.experience[0].title).toBe("Battalion Maintenance Officer");
  });

  it("removes a bullet with a figure the master does not have, or evidence from another role", () => {
    expect(resume.experience[0].bullets.map((b) => b.text)).toEqual(["Raised equipment readiness from 71% to 92% in 14 months."]);
    expect(findings.find((f) => f.gate === "figures")?.level).toBe("warn");
  });

  it("lets the master's summary and highlights back the targeted summary", () => {
    expect(resume.summary).toContain("20 years of Marine Corps experience");
  });

  it("removes a bullet or summary sentence naming a tool the master does not mention, and reports it as a tools finding", () => {
    expect(resume.experience[0].bullets.some((b) => /Tableau/.test(b.text))).toBe(false);
    expect(resume.summary).not.toMatch(/Tableau/);
    const tools = findings.find((f) => f.check === "No tools or systems your record does not mention");
    expect(tools?.level).toBe("warn");
    expect(tools?.detail).toMatch(/Tableau/);
    expect(findings.find((f) => f.gate === "credentials")?.detail ?? "").not.toMatch(/Tableau/);
  });

  it("drops a skill the master never mentions", () => {
    expect(resume.skills).toEqual(["Change Strategy", "Power BI"]);
  });
});
