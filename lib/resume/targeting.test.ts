import { describe, expect, it } from "vitest";
import { gateTargetedResume } from "@/lib/resume/build";
import { recordFromMaster } from "@/lib/resume/master-record";
import { contentHash, figureChecks, figuresIn, mergeAdditions, splitProjects, timelineGaps, unusedLines } from "@/lib/resume/targeting";

const MASTER = `EXECUTIVE PROFILE
Transformation leader with 20 years of Marine Corps experience.

Battalion Maintenance Officer | 2d LAR
Oct 2023 - Present
Designed a Power BI readiness system that cut total preparation from 35.5 hours per cycle to 13.5, roughly 62 percent.
Directed more than 4,200 service requests and governed more than $120M in equipment.
Trained senior technicians across specialties.

Maintenance Officer | PM LAV
Jun 2022 - Oct 2023
Led integrated product team activities, working distributed for roughly 80 percent of the assignment.

SELECTED PROJECTS
MilVector
Built an AI-enabled transition platform used by service members.`;

const raw = {
  summary: ["Transformation leader with 20 years of Marine Corps experience."],
  roles: [
    {
      title: "Battalion Maintenance Officer",
      organization: "2d LAR",
      start: "Oct 2023",
      end: "Present",
      lines: [
        "Designed a Power BI readiness system that cut total preparation from 35.5 hours per cycle to 13.5, roughly 62 percent.",
        "Directed more than 4,200 service requests and governed more than $120M in equipment.",
        "Trained senior technicians across specialties.",
      ],
    },
    { title: "Maintenance Officer", organization: "PM LAV", start: "Jun 2022", end: "Oct 2023", lines: ["Led integrated product team activities, working distributed for roughly 80 percent of the assignment."] },
    { title: "MilVector", organization: "", start: "", end: "", lines: ["Built an AI-enabled transition platform used by service members."] },
  ],
};
const source = { documentId: "doc", filename: "master.docx", docType: "MASTER_RESUME" };
const { record, supportLines } = recordFromMaster({ raw, masterText: MASTER, source, builtAt: "2026-11-20T00:00:00Z" });

const draft = {
  summary: "Transformation leader with 20 years of Marine Corps experience.",
  skills: [],
  experience: [
    { role_id: "ROLE-01", bullets: [{ text: "Cut readiness briefing preparation from 35.5 hours per cycle to 13.5, roughly 62 percent, with Power BI.", evidence: ["ACC-01-01"] }] },
    { role_id: "ROLE-03", bullets: [{ text: "Built an AI-enabled transition platform for service members.", evidence: ["ACC-03-01"] }] },
  ],
};

describe("a version of a master", () => {
  it("has a stable key that ignores line endings and trailing space", () => {
    expect(contentHash("a\r\nb\n")).toBe(contentHash("a\nb"));
    expect(contentHash("a\nb")).toMatch(/^[0-9a-f]{64}$/);
    expect(contentHash("a\nb")).not.toBe(contentHash("a\nc"));
  });
});

describe("the top-up from unused master lines", () => {
  it("lists only lines the draft did not cite, by role", () => {
    const text = unusedLines(record, draft);
    expect(text).toContain("ACC-01-02 | Directed more than 4,200 service requests");
    expect(text).toContain("ACC-02-01 | Led integrated product team activities");
    expect(text).not.toContain("ACC-01-01");
    expect(text).not.toContain("ACC-03-01");
  });

  it("adds new bullets after a role's own, and adds a role the draft lacked", () => {
    const merged = mergeAdditions(draft, [
      { role_id: "ROLE-01", bullets: [{ text: "Directed more than 4,200 service requests.", evidence: ["ACC-01-02"] }] },
      { role_id: "ROLE-02", bullets: [{ text: "Led integrated product team activities.", evidence: ["ACC-02-01"] }] },
      { role_id: "", bullets: [{ text: "ignored", evidence: [] }] },
    ]);
    const experience = merged.experience as { role_id: string; bullets: { text: string }[] }[];
    expect(experience.find((e) => e.role_id === "ROLE-01")!.bullets.map((b) => b.text)).toEqual([
      "Cut readiness briefing preparation from 35.5 hours per cycle to 13.5, roughly 62 percent, with Power BI.",
      "Directed more than 4,200 service requests.",
    ]);
    expect(experience.some((e) => e.role_id === "ROLE-02")).toBe(true);
    // The original draft is untouched.
    expect((draft.experience[0].bullets as unknown[]).length).toBe(1);
  });

  it("is checked again in full: a top-up bullet with an invented figure is removed", () => {
    const merged = mergeAdditions(draft, [{ role_id: "ROLE-01", bullets: [{ text: "Directed more than 5,000 service requests.", evidence: ["ACC-01-02"] }] }]);
    const { resume } = gateTargetedResume({ raw: merged, record, titlesFromRecord: true });
    expect(resume.experience[0].bullets.some((b) => b.text.includes("5,000"))).toBe(false);
  });
});

describe("projects print apart from jobs", () => {
  it("splits undated sections out of the experience", () => {
    const { resume } = gateTargetedResume({ raw: draft, record, titlesFromRecord: true });
    const { jobs, projects } = splitProjects(resume);
    expect(jobs.map((r) => r.title)).toEqual(["Battalion Maintenance Officer"]);
    expect(projects.map((r) => r.title)).toEqual(["MilVector"]);
  });
});

describe("check every figure before you send", () => {
  it("finds the figures a reader sees, not small counts or years", () => {
    expect(figuresIn("Cut prep from 35.5 hours to 13.5, roughly 62 percent, across $120M and 4,200 requests in 2024 with 2 teams.")).toEqual([
      "35.5",
      "13.5",
      "62 percent",
      "$120M",
      "4,200",
    ]);
  });

  it("lists each bullet with figures beside the master line it came from", () => {
    const { resume } = gateTargetedResume({ raw: draft, record, titlesFromRecord: true, extraSupport: supportLines.join(" ") });
    const checks = figureChecks(resume, record, supportLines);
    const briefing = checks.find((c) => c.place === "Battalion Maintenance Officer")!;
    expect(briefing.figures).toEqual(["35.5", "13.5", "62 percent"]);
    expect(briefing.sources[0]).toContain("cut total preparation from 35.5 hours per cycle to 13.5");
    // The summary's figure is traced to the master's own summary.
    const summary = checks.find((c) => c.place === "Summary")!;
    expect(summary.figures).toEqual(["20"]);
    expect(summary.sources[0]).toBe("Transformation leader with 20 years of Marine Corps experience.");
    // A bullet with no figures is not listed.
    expect(checks.some((c) => c.place === "MilVector")).toBe(false);
  });
});

describe("the Word file and text preview", () => {
  const resume = {
    target_title: "Director of AI Transformation",
    executive_summary: "Leader.",
    core_skills: ["Change Strategy"],
    experience: [{ role_title: "Battalion Maintenance Officer", organization: "2d LAR", location: "", dates: "Oct 2023 - Present", bullets: ["Led maintenance."] }],
    selected_projects: [{ role_title: "MilVector", organization: "", location: "", dates: "", bullets: ["Built a transition platform."] }],
    off_duty_education: [],
    civilian_certifications: [],
    additional_training: [],
  };

  it("print undated sections under Selected Projects, after the experience", async () => {
    const { buildTargetedResumeText, renderTargetedResumeDocx } = await import("@/lib/resume-template");
    const text = buildTargetedResumeText({ contact: { full_name: "Jordan Reyes" }, resume });
    expect(text.indexOf("PROFESSIONAL EXPERIENCE")).toBeLessThan(text.indexOf("SELECTED PROJECTS"));
    expect(text).toMatch(/SELECTED PROJECTS\nMilVector\n- Built a transition platform\./);
    const buffer = await renderTargetedResumeDocx({ contact: { full_name: "Jordan Reyes" }, resume });
    expect(buffer.byteLength).toBeGreaterThan(1000);
  });
});

describe("no unexplained gap in the timeline", () => {
  const master = `A | Org A
Jan 2026 - Present
Did a.
B | Org B
Oct 2023 - Present
Did b.
C | Org C
Jun 2022 - Oct 2023
Did c.
D | Org D
2018 - 2021
Did d.
E | Org E
2010 - 2014
Did e.
PROJECTS
P
Did p.`;
  const roles = [
    { title: "A", organization: "Org A", start: "Jan 2026", end: "Present", lines: ["Did a."] },
    { title: "B", organization: "Org B", start: "Oct 2023", end: "Present", lines: ["Did b."] },
    { title: "C", organization: "Org C", start: "Jun 2022", end: "Oct 2023", lines: ["Did c."] },
    { title: "D", organization: "Org D", start: "2018", end: "2021", lines: ["Did d."] },
    { title: "E", organization: "Org E", start: "2010", end: "2014", lines: ["Did e."] },
    { title: "P", organization: "", start: "", end: "", lines: ["Did p."] },
  ];
  const { record: r } = recordFromMaster({ raw: { roles }, masterText: master, source, builtAt: "2026-11-20T00:00:00Z" });
  const kept = (...ids: string[]) => ({ experience: ids.map((roleId) => ({ roleId, title: "", organization: "", dates: "", bullets: [] })) });

  it("finds jobs skipped inside the span the resume covers", () => {
    expect(timelineGaps(r, kept("ROLE-01", "ROLE-02", "ROLE-04"), new Date("2026-11-20T00:00:00Z")).map((role) => role.title)).toEqual(["C"]);
  });

  it("does not count jobs older than ten years past the oldest one kept, or undated projects", () => {
    const today = new Date("2026-11-20T00:00:00Z");
    expect(timelineGaps(r, kept("ROLE-01", "ROLE-02", "ROLE-03", "ROLE-04"), today)).toEqual([]);
    expect(timelineGaps(r, kept("ROLE-01", "ROLE-02", "ROLE-03", "ROLE-04", "ROLE-06"), today)).toEqual([]);
  });

  it("counts a job from the last ten years even when it is older than every job kept", () => {
    const today = new Date("2026-11-20T00:00:00Z");
    // Keeping only the two newest leaves out C (2022 to 2023) and D (2018 to 2021); E (2010 to 2014) is older than ten years.
    expect(timelineGaps(r, kept("ROLE-01", "ROLE-02"), today).map((role) => role.title)).toEqual(["C", "D"]);
  });
});

describe("no role crowds out the rest of the career", () => {
  it("keeps at most the given number of bullets per role, highest priority first", () => {
    const many = { experience: [{ role_id: "ROLE-01", bullets: Array.from({ length: 10 }, () => ({ text: "Trained senior technicians across specialties.", evidence: ["ACC-01-03"] })) }] };
    // Identical bullets would be de-duplicated, so vary them by citing the same line with distinct wording.
    many.experience[0].bullets = many.experience[0].bullets.map((b, i) => ({ ...b, text: `${b.text.replace(".", "")} in team ${String.fromCharCode(65 + i)}.` }));
    const { resume } = gateTargetedResume({ raw: many, record, titlesFromRecord: true, maxBulletsPerRole: 8 });
    expect(resume.experience[0].bullets.length).toBeLessThanOrEqual(8);
    expect(resume.experience[0].bullets[0].text).toContain("team A");
  });
});

describe("a job held alongside another leaves no gap", () => {
  const master = `Battalion Maintenance Officer | 2d LAR
Oct 2023 - Present
Led maintenance.
Executive Officer | Multinational Task Force
2025
Planned operations.
Assistant Maintenance Operations Officer | 2d Maint Bn
May 2021 - Jun 2022
Advised leaders.
Maintenance Officer | PM LAV
Jun 2022 - Oct 2023
Advised units.
Maintenance Control Officer | 2d and 3d Maint Bn
2018 - 2021
Coached teams.`;
  const roles = [
    { title: "Battalion Maintenance Officer", organization: "2d LAR", start: "Oct 2023", end: "Present", lines: ["Led maintenance."] },
    { title: "Executive Officer", organization: "Multinational Task Force", start: "2025", end: "", lines: ["Planned operations."] },
    { title: "Assistant Maintenance Operations Officer", organization: "2d Maint Bn", start: "May 2021", end: "Jun 2022", lines: ["Advised leaders."] },
    { title: "Maintenance Officer", organization: "PM LAV", start: "Jun 2022", end: "Oct 2023", lines: ["Advised units."] },
    { title: "Maintenance Control Officer", organization: "2d and 3d Maint Bn", start: "2018", end: "2021", lines: ["Coached teams."] },
  ];
  const { record: r } = recordFromMaster({ raw: { roles }, masterText: master, source, builtAt: "2026-11-20T00:00:00Z" });
  const id = (title: string) => r.roles.find((role) => role.title === title)!.id;
  const kept = (...titles: string[]) => ({ experience: titles.map((t) => ({ roleId: id(t), title: t, organization: "", dates: "", bullets: [] })) });

  it("counts only the period no kept job covers", () => {
    const gaps = timelineGaps(r, kept("Battalion Maintenance Officer", "Maintenance Officer", "Maintenance Control Officer"), new Date("2026-11-20T00:00:00Z"));
    expect(gaps.map((role) => role.title)).toEqual(["Assistant Maintenance Operations Officer"]);
  });
});

describe("trimming to two pages keeps the jobs deep", () => {
  // Every bullet gets its own words, so none reads as a repeat of another.
  const long = (seed: number) => "Led " + Array.from({ length: 34 }, (_, i) => `task${seed}x${i}`).join(" ") + ".";
  const role = (r: number, start: string, end: string, lines: number) => ({
    id: `ROLE-0${r}`,
    title: `Role ${r}`,
    militaryTitle: `Role ${r}`,
    organization: `Org ${r}`,
    start,
    end,
    accomplishments: Array.from({ length: lines }, (_, i) => ({ id: `ACC-0${r}-0${i + 1}`, text: long(r * 10 + i), verifiedNumbers: [], unverifiedNumbers: [], sources: [source], fromAward: false })),
  });
  const big = {
    version: 2 as const,
    builtAt: "2026-11-20T00:00:00Z",
    summary: "",
    competencies: [],
    roles: [role(1, "Jan 2024", "Present", 7), role(2, "Jan 2021", "Dec 2023", 7), role(3, "Jan 2018", "Dec 2020", 7), role(4, "", "", 3), role(5, "", "", 3)],
    credentials: [],
    openQuestions: [],
    stats: { documentsRead: 1, documentsAvailable: 1, accomplishments: 27, heldForReview: 0 },
  };
  const raw = {
    summary: "",
    skills: [],
    experience: big.roles.map((r) => ({ role_id: r.id, bullets: r.accomplishments.map((a) => ({ text: a.text, evidence: [a.id] })) })),
  };

  it("drops projects before any job falls below three bullets", () => {
    const { resume } = gateTargetedResume({ raw, record: big, titlesFromRecord: true });
    expect(resume.estimatedPages).toBeLessThanOrEqual(2.05);
    const jobs = resume.experience.filter((r) => r.dates);
    const projects = resume.experience.filter((r) => !r.dates);
    expect(jobs.length).toBe(3);
    if (jobs.some((j) => j.bullets.length < 3)) expect(projects.length).toBe(0);
    expect(jobs[0].bullets.length).toBeGreaterThanOrEqual(3);
  });
});
