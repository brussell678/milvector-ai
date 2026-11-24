import { describe, expect, it } from "vitest";
import { ANNOUNCEMENT_WINDOW_DAYS, monthLabel, olderThan, onTheBar } from "@/lib/updates/announcement";

const now = new Date("2026-11-23T18:00:00.000Z");

describe("the update on the announcement bar", () => {
  it("is the newest published one, until 21 days after it was published", () => {
    const posted = [
      { id: "old", published_at: "2026-11-10T12:00:00.000Z" },
      { id: "newest", published_at: "2026-11-22T12:00:00.000Z" },
      { id: "mid", published_at: "2026-11-15T12:00:00.000Z" },
    ];
    const bar = onTheBar(posted, now);
    expect(bar?.id).toBe("newest");
    expect(bar?.until.toISOString()).toBe("2026-12-13T12:00:00.000Z");
    expect(ANNOUNCEMENT_WINDOW_DAYS).toBe(21);
  });

  it("is nobody once the newest is more than 21 days old, or when nothing is posted", () => {
    expect(onTheBar([{ id: "a", published_at: "2026-10-01T00:00:00.000Z" }], now)).toBeNull();
    expect(onTheBar([], now)).toBeNull();
  });
});

describe("drafts and months", () => {
  it("tags a draft older than the limit", () => {
    expect(olderThan("2026-10-20T00:00:00.000Z", 30, now)).toBe(true);
    expect(olderThan("2026-11-01T00:00:00.000Z", 30, now)).toBe(false);
  });

  it("names the month for grouping", () => {
    expect(monthLabel("2026-11-15T12:00:00.000Z")).toBe("November 2026");
  });
});
