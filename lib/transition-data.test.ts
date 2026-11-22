import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ADMIN_EMAIL } from "@/lib/auth";
import { toolLinkVisible } from "@/lib/tools/preview";
import { toolGroups, toolTitleFor } from "@/lib/tools/registry";
import { mergeDashboardTasks, publicDocHref } from "@/lib/transition-data";

type Fallback = Parameters<typeof mergeDashboardTasks>[1][number];
const data = JSON.parse(readFileSync(path.join(process.cwd(), "data", "milvector_transition_tasks.json"), "utf8")) as { tasks: Fallback[] };

function row(over: Partial<Parameters<typeof mergeDashboardTasks>[0][number]> = {}) {
  return {
    id: "db-1",
    external_id: "mv-0089",
    title: "Identify ceremony attendee list - send out e-Invite",
    description: null,
    category: "Administrative",
    phase_month: 6,
    days_before_event: 150,
    tool_link: null,
    knowledge_article: null,
    assistance_type: "doc" as const,
    assistance_ref: "./docs/public/2b - Retirement Ceremony Checklist v3.pdf",
    assistance_notes: null,
    transition_supporting_tasks: [],
    ...over,
  };
}

describe("library file links on Timeline tasks", () => {
  it("points ./docs/public files at the route that serves them", () => {
    expect(publicDocHref("./docs/public/2b - Retirement Ceremony Checklist v3.pdf")).toBe("/api/public-docs/2b%20-%20Retirement%20Ceremony%20Checklist%20v3.pdf");
    expect(publicDocHref("docs/public/0 - Appendix J Fillable Form.pdf")).toBe("/api/public-docs/0%20-%20Appendix%20J%20Fillable%20Form.pdf");
    expect(publicDocHref("/app/tools/resume-targeter")).toBe("/app/tools/resume-targeter");
    expect(publicDocHref("https://www.dfas.mil")).toBe("https://www.dfas.mil");
    expect(publicDocHref(null)).toBeNull();
  });

  it("every document a task names exists in docs/public", () => {
    const files = data.tasks
      .map((task) => task.assistance_ref)
      .filter((ref): ref is string => !!ref && ref.includes("docs/public/"))
      .map((ref) => ref.replace(/^\.?\/?docs\/public\//, ""));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) expect(existsSync(path.join(process.cwd(), "docs", "public", file)), file).toBe(true);
  });

  it("rewrites database rows and fallback rows alike", () => {
    const [merged] = mergeDashboardTasks([row()], data.tasks);
    expect(merged.assistance_ref).toMatch(/^\/api\/public-docs\//);
    const fromFallbackOnly = mergeDashboardTasks<ReturnType<typeof row>>([], data.tasks);
    expect(fromFallbackOnly.every((task) => !task.assistance_ref?.startsWith("./"))).toBe(true);
  });
});

describe("ceremony tasks link to the Retirement Invitation Builder", () => {
  const byId = new Map(data.tasks.map((task) => [task.external_id, task]));

  it("maps the five ceremony tasks to the builder, deep-linked by tab", () => {
    expect(byId.get("mv-0089")?.tool_link).toBe("/app/tools/retirement-invitation");
    expect(byId.get("mv-0090")?.tool_link).toBe("/app/tools/retirement-invitation?tab=program");
    expect(byId.get("mv-0095")?.tool_link).toBe("/app/tools/retirement-invitation?tab=program");
    expect(byId.get("mv-0096")?.tool_link).toBe("/app/tools/retirement-invitation?tab=program");
    expect(byId.get("mv-0099")?.tool_link).toBe("/app/tools/retirement-invitation?tab=guests");
    // The checklist stays alongside it.
    expect(byId.get("mv-0096")?.assistance_ref).toContain("Retirement Ceremony Checklist");
  });

  it("carries the link onto the database row, and keeps it for those the tool is open to", () => {
    const [merged] = mergeDashboardTasks([row()], data.tasks, () => true);
    expect(merged.tool_link).toBe("/app/tools/retirement-invitation");
  });

  it("drops the link for a member the tool is not open to", () => {
    const [merged] = mergeDashboardTasks([row()], data.tasks, () => false);
    expect(merged.tool_link).toBeNull();
    expect(merged.assistance_ref).toMatch(/^\/api\/public-docs\//);
    const fallbackOnly = mergeDashboardTasks<ReturnType<typeof row>>([], data.tasks, () => false);
    expect(fallbackOnly.some((task) => task.tool_link)).toBe(false);
  });

  it("keeps a database tool link that is not gated", () => {
    const [merged] = mergeDashboardTasks([row({ external_id: "db-only", title: "Something only in the database", tool_link: "/app/tools/mos-translator" })], data.tasks, (href) => !href.includes("retirement-invitation"));
    expect(merged.tool_link).toBe("/app/tools/mos-translator");
  });
});

describe("Timeline tasks link to the tool that does them", () => {
  const byId = new Map(data.tasks.map((task) => [task.external_id, task]));

  it("every tool link opens a tool in the Tools hub", () => {
    const linked = data.tasks.filter((task) => task.tool_link);
    expect(linked.length).toBeGreaterThanOrEqual(16);
    for (const task of linked) expect(toolTitleFor(task.tool_link as string), `${task.external_id} ${task.tool_link}`).not.toBeNull();
  });

  it("links the tasks MilVector has a tool for", () => {
    const expected: Record<string, string> = {
      "mv-0014": "/app/tools/va-rating-navigator",
      "mv-0084": "/app/tools/sbp-advisor",
      "mv-0064": "/retirement-calculator",
      "mv-0062": "/app/tools/fitrep-bullets",
      "mv-0067": "/app/tools/linkedin-builder",
      "mv-0069": "/app/tools/mos-translator",
      "mv-0070": "/app/tools/business-card",
      "mv-0071": "/app/tools/business-card",
      "mv-0074": "/app/tools/resume-targeter",
      "mv-0075": "/app/tools/interview-strategist",
      "mv-0092": "/app/tools/retirement-invitation?tab=share",
    };
    for (const [id, href] of Object.entries(expected)) expect(byId.get(id)?.tool_link, id).toBe(href);
  });

  it("never tells a member there is no MilVector tool", () => {
    for (const task of data.tasks) expect(task.assistance_notes ?? "", task.external_id).not.toMatch(/No direct MilVector tool/i);
  });

  it("an empty guidance note hides an old note stored in the database", () => {
    const [merged] = mergeDashboardTasks(
      [row({ external_id: "mv-0031", title: "Obtain ACP mentor to assist with transition", assistance_notes: "No direct MilVector tool or public template currently mapped for this task." })],
      data.tasks
    );
    expect(merged.assistance_notes).toBe("");
  });

  it("files the VA claim inside the BDD window, 180 to 90 days before EAS", () => {
    const bdd = byId.get("mv-0014");
    expect(bdd?.days_before_event).toBeLessThanOrEqual(180);
    expect(bdd?.days_before_event).toBeGreaterThanOrEqual(90);
    expect(bdd?.phase_month).toBe(9);
  });

  it("orders tasks by the curated phase and due date, not the database row", () => {
    const merged = mergeDashboardTasks(
      [
        row({ id: "db-bdd", external_id: "mv-0014", title: "Complete VA Disability Claim for BDD (180-90 days from EAS)", phase_month: 18, days_before_event: 450 }),
        row({ id: "db-card", external_id: "mv-0070", title: "Make transition business card with skills", phase_month: 9, days_before_event: 240 }),
        row({ id: "db-trs", external_id: "mv-0001", title: "Complete TRS", phase_month: 24, days_before_event: 540 }),
      ],
      data.tasks
    );
    expect(merged.map((task) => task.id)).toEqual(["db-trs", "db-card", "db-bdd"]);
    expect(merged[2].phase_month).toBe(9);
  });
});

describe("toolLinkVisible: switched tools follow their own switch", () => {
  const before = process.env.RETIREMENT_INVITE_PUBLIC;
  afterEach(() => {
    if (before === undefined) delete process.env.RETIREMENT_INVITE_PUBLIC;
    else process.env.RETIREMENT_INVITE_PUBLIC = before;
  });

  it("shows the launched builder, deep links included, to every member", () => {
    delete process.env.RETIREMENT_INVITE_PUBLIC;
    expect(toolLinkVisible("/app/tools/retirement-invitation", "member@example.com")).toBe(true);
    expect(toolLinkVisible("/app/tools/retirement-invitation?tab=guests", "member@example.com")).toBe(true);
  });

  it("hides it from members, but not the admin, when its off switch is set", () => {
    process.env.RETIREMENT_INVITE_PUBLIC = "false";
    expect(toolLinkVisible("/app/tools/retirement-invitation", "member@example.com")).toBe(false);
    expect(toolLinkVisible("/app/tools/retirement-invitation?tab=program", "member@example.com")).toBe(false);
    expect(toolLinkVisible("/app/tools/retirement-invitation?tab=program", ADMIN_EMAIL)).toBe(true);
  });

  it("never hides a tool that is not a preview", () => {
    expect(toolLinkVisible("/app/tools/resume-targeter", null)).toBe(true);
    expect(toolLinkVisible("/app/library", null)).toBe(true);
    expect(toolLinkVisible("constructor", null)).toBe(true);
  });
});

describe("toolTitleFor", () => {
  it("names a tool for a link to it, without the preview tag", () => {
    expect(toolTitleFor("/app/tools/retirement-invitation?tab=program")).toBe("Retirement Invitation Builder");
    const resume = toolGroups.flatMap((g) => g.tools).find((t) => t.href === "/app/tools/resume-targeter");
    expect(toolTitleFor("/app/tools/resume-targeter")).toBe(resume?.title);
    expect(toolTitleFor("/app/nowhere")).toBeNull();
  });
});
