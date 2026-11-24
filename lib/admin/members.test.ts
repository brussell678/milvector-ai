import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CLEARED_TABLES } from "@/lib/admin/clear-records";
import { hasRecords } from "@/lib/admin/members";
import { CLEARED_LIST, KEPT_LINE, retentionEmail } from "@/lib/email";

const none = { documents: 0, resumes: 0, linkedin: 0, invites: 0, timeline_done: 0, tool_runs: 0 };

describe("what clearing covers", () => {
  it("counts anything clearing would remove as records", () => {
    expect(hasRecords(none)).toBe(false);
    for (const key of Object.keys(none) as (keyof typeof none)[]) expect(hasRecords({ ...none, [key]: 1 })).toBe(true);
  });

  it("clears the approved tables and never the card, Community, or account tables", () => {
    expect([...CLEARED_TABLES].sort()).toEqual(
      ["documents", "linkedin_profiles", "master_corrections", "master_resume_structures", "resume_artifacts", "retirement_invites", "tool_runs", "transition_task_completions"].sort(),
    );
    for (const kept of ["business_cards", "business_card_leads", "message_board_posts", "profiles", "feedback", "library_submissions", "tool_acknowledgments"]) {
      expect(CLEARED_TABLES as readonly string[]).not.toContain(kept);
    }
  });

  it("matches the privacy page's list", () => {
    const privacy = readFileSync(path.join(process.cwd(), "app", "privacy", "page.tsx"), "utf8");
    for (const phrase of ["the records you uploaded and the files MilVector made for you in My Files", "your master and targeted resumes", "your Timeline progress", "LinkedIn Builder drafts", "your retirement invitation page"]) {
      expect(privacy).toContain(phrase);
    }
    expect(CLEARED_LIST).toContain("your Timeline progress");
  });
});

describe("the emails", () => {
  const to = "jordan@example.com";

  it("names the date, what goes, what stays, and how to keep it all", () => {
    const mail = retentionEmail({ to, name: "Jordan A. Reyes", kind: "notice", clearOn: "2026-03-10" });
    expect(mail.subject).toBe("Your MilVector transition records will be cleared on March 10, 2026");
    expect(mail.html).toContain("Hi Jordan,");
    expect(mail.html).toContain("<b>To keep everything, just sign in before March 10, 2026.</b>");
    expect(mail.html).toContain(KEPT_LINE);
    for (const item of CLEARED_LIST) expect(mail.html).toContain(item);
  });

  it("says two weeks in the final notice, and what happened once cleared", () => {
    expect(retentionEmail({ to, kind: "final", clearOn: "2026-03-10" }).subject).toBe("Two weeks left: your MilVector records clear on March 10, 2026");
    const cleared = retentionEmail({ to, name: null, kind: "cleared", clearOn: "2026-03-11" });
    expect(cleared.subject).toBe("Your MilVector transition records were cleared");
    expect(cleared.html).toContain("Hello,");
    expect(cleared.html).toContain(KEPT_LINE);
  });

  it("has no em or en dashes", () => {
    for (const kind of ["notice", "final", "cleared"] as const) {
      const mail = retentionEmail({ to, name: "Sam", kind, clearOn: "2026-03-10" });
      expect(`${mail.subject} ${mail.title} ${mail.html}`).not.toMatch(/[—–]/);
    }
  });
});
