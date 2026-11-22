import { describe, expect, it } from "vitest";
import { buildFitMap, buildRecord, gateTargetedResume, mergeExtractions, normalizeExtraction, type BatchDocument } from "@/lib/resume/build";
import { recordForPrompt, renderMasterResume, usableEvidence } from "@/lib/resume/record";

const docs: BatchDocument[] = [
  {
    documentId: "d1",
    filename: "fitrep-2022.pdf",
    docType: "FITREP",
    text: "Maintenance Officer, 2d Maintenance Battalion, Jun 2020 to May 2023. Supervised 42 Marines. Maintained 118 vehicles valued at $14.2M at a 96 percent readiness rate. Reduced engine repair cycle from 120 to 56 days.",
  },
  {
    documentId: "d2",
    filename: "nam-soa.pdf",
    docType: "AWARD",
    text: "For meritorious service as Maintenance Officer from Jun 2020 to May 2023. Reduced the engine repair cycle from 120 days to 56 days, returning 31 vehicles to service.",
  },
];

const rawExtraction = {
  roles: [{ key: "r1", military_title: "Maintenance Officer", organization: "2d Maintenance Battalion", start: "Jun 2020", end: "May 2023", source_doc: 1 }],
  accomplishments: [
    { role_key: "r1", text: "Supervised 42 Marines and maintained 118 vehicles valued at $14.2M at 96 percent readiness.", source_doc: 1 },
    { role_key: "r1", text: "Reduced engine repair cycle from 120 to 56 days.", source_doc: 1 },
    { role_key: "r1", text: "Reduced the engine repair cycle from 120 to 56 days, returning 31 vehicles to service.", source_doc: 2, from_award: true },
    { role_key: "r1", text: "Saved $3M in annual maintenance costs.", source_doc: 1 }, // not in the document
    { role_key: "r9", text: "Orphan accomplishment with no role.", source_doc: 1 },
    { role_key: "r1", text: "From a document that does not exist.", source_doc: 7 },
  ],
  credentials: [{ kind: "certification", text: "Lean Six Sigma Green Belt", source_doc: 1 }],
  questions: ["Was the billet held through May 2023?"],
};

const extraction = mergeExtractions([normalizeExtraction(rawExtraction, docs, "b0")]);

describe("normalizeExtraction", () => {
  it("drops accomplishments with no real role or document", () => {
    expect(extraction.accomplishments.map((a) => a.id)).toEqual(["b0-a1", "b0-a2", "b0-a3", "b0-a4"]);
  });

  it("verifies figures against the document each item cites", () => {
    expect(extraction.accomplishments[0].unverifiedNumbers).toEqual([]);
    expect(extraction.accomplishments[3].unverifiedNumbers).toEqual(["3000000"]);
  });

  it("marks award-sourced items", () => {
    expect(extraction.accomplishments[2].fromAward).toBe(true);
  });
});

const consolidated = {
  summary: "Maintenance operations leader who supervised 42 personnel. Holds a PMP and a Top Secret clearance. Reduced repair cycle time from 120 to 56 days.",
  competencies: ["Maintenance Operations", "Team Leadership"],
  roles: [
    {
      title: "Maintenance Operations Manager",
      military_title: "Maintenance Officer",
      organization: "2d Maintenance Battalion",
      start: "Jun 2020",
      end: "May 2023",
      from_role_keys: ["b0-r1"],
      accomplishments: [
        { text: "Led a 42-person team maintaining 118 vehicles valued at $14.2M at 96 percent readiness.", from: ["b0-a1"] },
        { text: "Cut the engine repair cycle from 120 to 56 days — returning 31 vehicles to service.", from: ["b0-a2", "b0-a3"] },
        { text: "Saved $3M in annual maintenance costs.", from: ["b0-a4"] },
        { text: "Improved morale by 40 percent.", from: ["b0-a1"] }, // figure not in the source item
        { text: "Invented with no source.", from: ["nope"] },
      ],
    },
  ],
  credentials: [{ kind: "certification", text: "Lean Six Sigma Green Belt", from: ["b0-c1"] }],
  open_questions: [],
};

const record = buildRecord({
  consolidated,
  extraction,
  profile: { education: ["B.S. Organizational Leadership"], clearance: "Secret" },
  documentsRead: 2,
  documentsAvailable: 2,
  builtAt: "2026-11-14",
});

describe("buildRecord", () => {
  const role = record.roles[0];

  it("assigns ids and drops accomplishments with no source", () => {
    expect(role.id).toBe("ROLE-01");
    expect(role.accomplishments.map((a) => a.id)).toEqual(["ACC-01-01", "ACC-01-02", "ACC-01-03", "ACC-01-04"]);
  });

  it("merges a report and an award into one accomplishment with both sources", () => {
    expect(role.accomplishments[1].sources.map((s) => s.filename)).toEqual(["fitrep-2022.pdf", "nam-soa.pdf"]);
    expect(role.accomplishments[1].fromAward).toBe(true);
    expect(role.accomplishments[1].text).not.toMatch(/—/);
  });

  it("holds accomplishments whose figures cannot be traced, through both steps", () => {
    expect(role.accomplishments[2].unverifiedNumbers).toEqual(["3000000"]); // never in the document
    expect(role.accomplishments[3].unverifiedNumbers).toEqual(["40"]); // added during consolidation
    expect(record.stats.heldForReview).toBe(2);
  });

  it("keeps held accomplishments out of everything downstream", () => {
    const usable = usableEvidence(record);
    expect(usable.has("ACC-01-01")).toBe(true);
    expect(usable.has("ACC-01-03")).toBe(false);
    expect(recordForPrompt(record)).not.toMatch(/\$3M|40 percent/);
    expect(renderMasterResume(record)).not.toMatch(/\$3M|40 percent/);
  });

  it("removes summary sentences that claim a credential the record lacks", () => {
    expect(record.summary).toMatch(/42 personnel/);
    expect(record.summary).not.toMatch(/PMP|Top Secret/);
  });

  it("adds profile credentials and carries extraction questions forward", () => {
    expect(record.credentials.map((c) => c.text)).toEqual(["Lean Six Sigma Green Belt", "B.S. Organizational Leadership", "Secret security clearance"]);
    expect(record.openQuestions).toContain("Was the billet held through May 2023?");
  });

  it("renders a master resume other tools can read", () => {
    const resume = renderMasterResume(record);
    expect(resume).toMatch(/^Executive Summary/);
    expect(resume).toMatch(/Maintenance Operations Manager \| 2d Maintenance Battalion \| Jun 2020 - May 2023/);
  });
});

describe("buildFitMap", () => {
  const fit = buildFitMap(
    {
      requirements: [
        { requirement: "5+ years leading maintenance teams", type: "mandatory", assessment: "strong", evidence: ["ACC-01-01"], bridge: "" },
        { requirement: "PMP certification", type: "mandatory", assessment: "met", evidence: ["CRED-99"], bridge: "" },
        { requirement: "Budget ownership", type: "preferred", assessment: "partial", evidence: ["ACC-01-03"], bridge: "Emphasize asset value managed." },
      ],
      recommendation: "apply",
      recommendation_reason: "Strong operational match.",
      keywords: ["maintenance", "readiness"],
    },
    record
  );

  it("downgrades a requirement whose cited evidence does not exist or is held", () => {
    expect(fit.requirements[1].assessment).toBe("gap");
    expect(fit.requirements[2].assessment).toBe("gap"); // ACC-01-03 is held for review
  });

  it("counts years from the cited roles instead of trusting the assessment", () => {
    const tenure = (years: number) =>
      buildFitMap(
        { requirements: [{ requirement: `${years}+ years leading maintenance teams`, type: "mandatory", assessment: "strong", evidence: ["ROLE-01"], bridge: "" }], recommendation: "apply" },
        record,
        new Date(2026, 10, 14)
      ).requirements[0];
    // ROLE-01 runs Jun 2020 to May 2023: about 2.9 years
    expect(tenure(2).assessment).toBe("strong");
    expect(tenure(5).assessment).toBe("partial");
    expect(tenure(5).bridge).toMatch(/about 2\.9 years against the 5/);
  });

  it("will not recommend apply over a mandatory gap, and gives counts instead of a score", () => {
    expect(fit.recommendation).toBe("stretch");
    expect(fit.counts.mandatory).toEqual({ strong: 1, met: 0, partial: 0, gap: 1 });
  });
});

describe("buildFitMap: conditions of the job", () => {
  const travelPass = buildFitMap(
    {
      requirements: [
        { requirement: "Willingness to travel up to 25%", type: "mandatory", assessment: "gap", evidence: [], bridge: "Not shown in the record." },
        { requirement: "5+ years leading maintenance teams", type: "mandatory", assessment: "partial", evidence: ["ACC-01-01"], bridge: "" },
        { requirement: "Must pass a background check and drug screen", type: "mandatory", assessment: "gap", evidence: [], bridge: "" },
      ],
      recommendation: "pass",
      recommendation_reason: "The record does not show willingness to travel.",
    },
    record
  );

  it("treats travel and checks as conditions to confirm, not gaps", () => {
    const travel = travelPass.requirements.find((r) => /travel/.test(r.requirement))!;
    expect(travel.type).toBe("condition");
    expect(travel.assessment).toBe("confirm");
    expect(travel.evidence).toEqual([]);
    expect(travelPass.counts.mandatory.gap).toBe(0);
    expect(travelPass.counts.conditions).toBe(2);
  });

  it("does not pass someone over a condition, and says why", () => {
    expect(travelPass.recommendation).toBe("stretch");
    expect(travelPass.reason).toMatch(/None of the required qualifications is missing/);
    expect(travelPass.reason).toMatch(/conditions of the job/);
  });

  it("lists conditions after the qualifications", () => {
    expect(travelPass.requirements[0].type).toBe("mandatory");
    expect(travelPass.requirements.slice(1).every((r) => r.type === "condition")).toBe(true);
  });

  it("takes the model's own condition label", () => {
    const fit = buildFitMap({ requirements: [{ requirement: "Occasional weekend events", type: "condition", assessment: "confirm", evidence: ["ACC-01-01"] }], recommendation: "apply" }, record);
    expect(fit.requirements[0]).toMatchObject({ type: "condition", assessment: "confirm", evidence: [] });
  });

  it("keeps a real missing qualification as a gap, and its pass", () => {
    const fit = buildFitMap(
      {
        requirements: [
          { requirement: "Active TS/SCI clearance", type: "mandatory", assessment: "gap", evidence: [] },
          { requirement: "Experience managing travel budgets", type: "mandatory", assessment: "gap", evidence: [] },
          { requirement: "Willingness to travel 25%", type: "mandatory", assessment: "gap", evidence: [] },
        ],
        recommendation: "pass",
        recommendation_reason: "No clearance shown.",
      },
      record
    );
    expect(fit.requirements.filter((r) => r.type === "mandatory").map((r) => r.requirement)).toEqual(["Active TS/SCI clearance", "Experience managing travel budgets"]);
    expect(fit.recommendation).toBe("pass");
    expect(fit.reason).toBe("No clearance shown.");
  });
});

describe("gateTargetedResume", () => {
  const raw = {
    target_title: "Maintenance Operations Manager",
    summary: "Operations leader with 20 years of service. PMP-certified with an active Secret clearance. Led 42 personnel.",
    skills: ["Maintenance Management", "PMP", "Lean Six Sigma", "Team Leadership"],
    experience: [
      {
        role_id: "ROLE-01",
        title: "Maintenance Operations Manager",
        bullets: [
          { text: "Led a 42-person team sustaining 118 vehicles valued at $14.2M at 96 percent readiness.", evidence: ["ACC-01-01"] },
          { text: "Cut engine repair cycle time from 120 to 56 days, returning 31 vehicles to service.", evidence: ["ACC-01-02"] },
          { text: "Led 42 personnel and reduced costs by 25 percent.", evidence: ["ACC-01-01"] }, // 25 is invented
          { text: "Managed a $20M program portfolio.", evidence: [] }, // no evidence
          { text: "Saved $3M in annual maintenance costs.", evidence: ["ACC-01-03"] }, // held evidence
          { text: "Directed a 42-person team keeping 118 vehicles valued at $14.2M at 96 percent readiness.", evidence: ["ACC-01-01"] }, // duplicate
          { text: "Earned PMP while leading 42 personnel.", evidence: ["ACC-01-01"] }, // credential not held
        ],
      },
      { role_id: "ROLE-77", title: "Invented Role", bullets: [{ text: "Did things.", evidence: ["ACC-01-01"] }] },
    ],
    credential_ids: ["CRED-01", "CRED-02"],
    gaps: ["No PMP"],
  };

  const { resume, findings } = gateTargetedResume({ raw, record, profileClearance: "Secret", yearsOfService: 20 });
  const bullets = resume.experience[0].bullets.map((b) => b.text);
  const level = (check: RegExp) => findings.find((f) => check.test(f.check))?.level;

  it("keeps only bullets that trace to usable evidence with matching figures", () => {
    expect(bullets).toEqual([
      "Led a 42-person team sustaining 118 vehicles valued at $14.2M at 96 percent readiness.",
      "Cut engine repair cycle time from 120 to 56 days, returning 31 vehicles to service.",
    ]);
  });

  it("drops roles that are not in the record and takes organization and dates from it", () => {
    expect(resume.experience).toHaveLength(1);
    expect(resume.experience[0].organization).toBe("2d Maintenance Battalion");
    expect(resume.experience[0].dates).toBe("Jun 2020 - May 2023");
  });

  it("strips credentials not held from skills and the summary, and keeps the ones that are", () => {
    expect(resume.skills).toEqual(["Maintenance Management", "Lean Six Sigma", "Team Leadership"]);
    expect(resume.summary).not.toMatch(/PMP/);
    expect(resume.summary).toMatch(/20 years of service/);
    expect(resume.certifications).toEqual(["Lean Six Sigma Green Belt"]);
    expect(resume.education).toEqual(["B.S. Organizational Leadership"]);
  });

  it("reports each gate with what it removed", () => {
    expect(level(/cites your record/)).toBe("warn");
    expect(level(/figure matches/)).toBe("warn");
    expect(level(/stated twice/)).toBe("warn");
    expect(level(/clearance, degree/)).toBe("warn");
    expect(level(/two pages/)).toBe("pass");
    expect(resume.estimatedPages).toBeGreaterThan(0);
  });

  it("passes every gate on a clean resume", () => {
    const clean = gateTargetedResume({
      raw: { ...raw, summary: "Operations leader who led 42 personnel.", skills: ["Maintenance Management"], experience: [{ role_id: "ROLE-01", title: "Manager", bullets: raw.experience[0].bullets.slice(0, 2) }] },
      record,
      profileClearance: "Secret",
    });
    expect(clean.findings.every((f) => f.level === "pass")).toBe(true);
  });

  it("trims older roles' bullets when the resume runs long", () => {
    // Each bullet is made of its own words so the repetition gate leaves them alone.
    const LETTERS = "abcdefghijklmnopqrstuvwxyz";
    const unique = (r: number, i: number) => Array.from({ length: 22 }, (_, k) => `${LETTERS[r]}${LETTERS[i]}${LETTERS[k]}word`).join(" ");
    const bigRecord = {
      ...record,
      roles: Array.from({ length: 8 }, (_, r) => ({
        ...record.roles[0],
        id: `ROLE-0${r + 1}`,
        accomplishments: Array.from({ length: 9 }, (_, i) => ({ ...record.roles[0].accomplishments[0], id: `ACC-0${r + 1}-0${i + 1}`, text: `${unique(r, i)}.` })),
      })),
    };
    const out = gateTargetedResume({
      raw: {
        summary: "",
        skills: [],
        experience: bigRecord.roles.map((role) => ({ role_id: role.id, title: "Manager", bullets: role.accomplishments.map((a) => ({ text: a.text, evidence: [a.id] })) })),
      },
      record: bigRecord,
    });
    expect(out.resume.estimatedPages).toBeLessThanOrEqual(2);
    expect(out.findings.find((f) => f.gate === "length")?.detail).toMatch(/Cut \d+ lower-priority/);
    // The most recent role keeps more than the oldest
    expect(out.resume.experience[0].bullets.length).toBeGreaterThanOrEqual(out.resume.experience[out.resume.experience.length - 1].bullets.length);
  });
});
