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

describe("toolLinkVisible: preview tools follow their own switch", () => {
  const before = process.env.RETIREMENT_INVITE_PUBLIC;
  afterEach(() => {
    if (before === undefined) delete process.env.RETIREMENT_INVITE_PUBLIC;
    else process.env.RETIREMENT_INVITE_PUBLIC = before;
  });

  it("hides the builder, deep links included, from members while it is a preview", () => {
    delete process.env.RETIREMENT_INVITE_PUBLIC;
    expect(toolLinkVisible("/app/tools/retirement-invitation", "member@example.com")).toBe(false);
    expect(toolLinkVisible("/app/tools/retirement-invitation?tab=program", "member@example.com")).toBe(false);
    expect(toolLinkVisible("/app/tools/retirement-invitation?tab=program", ADMIN_EMAIL)).toBe(true);
  });

  it("shows it to everyone once opened", () => {
    process.env.RETIREMENT_INVITE_PUBLIC = "true";
    expect(toolLinkVisible("/app/tools/retirement-invitation?tab=guests", "member@example.com")).toBe(true);
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
