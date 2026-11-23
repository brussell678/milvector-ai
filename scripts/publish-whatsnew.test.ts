import { describe, expect, it } from "vitest";
import { entriesToAdd, parseEntries, toRows } from "./publish-whatsnew.mjs";

const before = `# What's New

<!-- ## Not an entry {new}
inside the format comment -->

## Short postings no longer blank the page {fix}
Now it tells you what to fix.
`;

const after = `# What's New

## Your High-3 now uses the real pay table for every month {improvement} {draft}
Each month comes from its own year's table.

## Short postings no longer blank the page {fix}
Now it tells you what to fix.
`;

describe("publish-whatsnew", () => {
  it("reads the draft tag alongside the category and skips the format comment", () => {
    const entries = parseEntries(after);
    expect(entries.map((e) => [e.title, e.category, e.draft])).toEqual([
      ["Your High-3 now uses the real pay table for every month", "improvement", true],
      ["Short postings no longer blank the page", "fix", false],
    ]);
  });

  it("adds a draft unpublished and a normal entry published", () => {
    const rows = toRows(parseEntries(after), Date.UTC(2026, 10, 23));
    expect(rows.map((r) => r.published)).toEqual([false, true]);
    expect(rows[0].published_at > rows[1].published_at).toBe(true);
  });

  it("adds only entries new in this push, so a draft deleted on the portal stays deleted", () => {
    const entries = parseEntries(after);
    // The draft was added in this push and is not in the table yet: add it.
    expect(entriesToAdd(entries, { previousEntries: parseEntries(before), existingTitles: ["Short postings no longer blank the page"] }).map((e) => e.title)).toEqual([
      "Your High-3 now uses the real pay table for every month",
    ]);
    // A later push touches the file again after the admin deleted that draft: nothing comes back.
    const later = `${after}\n## Another change {fix}\nSomething else.\n`;
    expect(entriesToAdd(parseEntries(later), { previousEntries: entries, existingTitles: ["Short postings no longer blank the page"] }).map((e) => e.title)).toEqual([
      "Another change",
    ]);
  });

  it("skips titles already in the table, ignoring case, and adds all missing ones on a manual run", () => {
    const entries = parseEntries(after);
    expect(entriesToAdd(entries, { existingTitles: ["short postings no longer blank the page"] }).map((e) => e.title)).toEqual([
      "Your High-3 now uses the real pay table for every month",
    ]);
  });
});
