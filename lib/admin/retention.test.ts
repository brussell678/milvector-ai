import { describe, expect, it } from "vitest";
import { addMonths, baseClearOn, inactiveLabel, lastActive, retentionState, type MemberActivity, type SentNotice } from "@/lib/admin/retention";

const member = (over: Partial<MemberActivity> = {}): MemberActivity => ({
  joinedAt: "2025-01-10T12:00:00.000Z",
  lastSignInAt: "2025-01-10T12:00:00.000Z",
  lastSeenAt: null,
  lastToolRun: null,
  retirementDate: null,
  recordsClearedAt: null,
  hasRecords: true,
  ...over,
});
const at = (iso: string) => new Date(iso);
const sent = (kind: SentNotice["kind"], clear_on: string, sent_at: string): SentNotice => ({ kind, clear_on, sent_at });

describe("dates", () => {
  it("adds calendar months, holding to the month's last day", () => {
    expect(addMonths(at("2026-01-31T00:00:00Z"), 1).toISOString()).toBe("2026-02-28T00:00:00.000Z");
    expect(addMonths(at("2025-01-10T12:00:00Z"), 14).toISOString()).toBe("2026-03-10T12:00:00.000Z");
  });

  it("takes the latest of joining, signing in, a page visit, and a tool run", () => {
    expect(lastActive(member({ lastSeenAt: "2025-06-01T00:00:00Z", lastToolRun: "2025-05-01T00:00:00Z" })).toISOString()).toBe("2025-06-01T00:00:00.000Z");
    expect(lastActive(member({ lastSignInAt: null })).toISOString()).toBe("2025-01-10T12:00:00.000Z");
  });

  it("clears 14 months after last use, never before 6 months after retirement", () => {
    expect(baseClearOn(member())).toBe("2026-03-10");
    expect(baseClearOn(member({ retirementDate: "2026-01-01" }))).toBe("2026-07-01");
    expect(baseClearOn(member({ retirementDate: "2025-01-01" }))).toBe("2026-03-10");
  });

  it("says how long ago in plain words", () => {
    expect(inactiveLabel(0)).toBe("today");
    expect(inactiveLabel(3)).toBe("3 days ago");
    expect(inactiveLabel(213)).toBe("6 months ago");
    expect(inactiveLabel(430)).toBe("1 year 2 months ago");
  });
});

describe("the timeline (last use 2025-01-10, clear date 2026-03-10)", () => {
  it("is Active under 6 months and Quiet after", () => {
    expect(retentionState(member(), [], at("2025-05-01T00:00:00Z")).status).toBe("active");
    expect(retentionState(member(), [], at("2025-08-01T00:00:00Z")).status).toBe("quiet");
    expect(retentionState(member(), [], at("2025-08-01T00:00:00Z")).due).toBeNull();
  });

  it("makes the first notice due 60 days before the clear date, naming that date", () => {
    expect(retentionState(member(), [], at("2026-01-08T00:00:00Z")).status).toBe("quiet");
    const s = retentionState(member(), [], at("2026-01-09T00:00:00Z"));
    expect(s.status).toBe("notice_due");
    expect(s.due).toEqual({ kind: "notice", clearOn: "2026-03-10" });
  });

  it("gives a full 60 days when the first notice goes out late", () => {
    const s = retentionState(member(), [], at("2026-04-01T00:00:00Z"));
    expect(s.due).toEqual({ kind: "notice", clearOn: "2026-05-31" });
    expect(s.status).toBe("notice_due");
  });

  it("after the notice: the final notice is due 14 days before", () => {
    const n = [sent("notice", "2026-03-10", "2026-01-09T15:00:00Z")];
    expect(retentionState(member(), n, at("2026-02-10T00:00:00Z"))).toMatchObject({ status: "notice", due: null, clearOn: "2026-03-10" });
    expect(retentionState(member(), n, at("2026-02-24T00:00:00Z")).due).toEqual({ kind: "final", clearOn: "2026-03-10" });
  });

  it("gives a full 14 days when the final notice goes out late", () => {
    const n = [sent("notice", "2026-03-10", "2026-01-09T15:00:00Z")];
    expect(retentionState(member(), n, at("2026-03-20T00:00:00Z")).due).toEqual({ kind: "final", clearOn: "2026-04-03" });
  });

  it("is Final after the final notice, then Ready on the clear date", () => {
    const n = [sent("notice", "2026-03-10", "2026-01-09T15:00:00Z"), sent("final", "2026-03-10", "2026-02-24T15:00:00Z")];
    expect(retentionState(member(), n, at("2026-03-01T00:00:00Z"))).toMatchObject({ status: "final", due: null });
    expect(retentionState(member(), n, at("2026-03-10T00:00:00Z"))).toMatchObject({ status: "ready", due: null, clearOn: "2026-03-10" });
  });

  it("is never Ready without both notices", () => {
    expect(retentionState(member(), [], at("2027-01-01T00:00:00Z")).status).toBe("notice_due");
    const n = [sent("notice", "2026-03-10", "2026-01-09T15:00:00Z")];
    expect(retentionState(member(), n, at("2027-01-01T00:00:00Z")).status).toBe("notice");
  });

  it("starts over when the member comes back; old notices no longer count", () => {
    const n = [sent("notice", "2026-03-10", "2026-01-09T15:00:00Z"), sent("final", "2026-03-10", "2026-02-24T15:00:00Z")];
    const back = member({ lastSeenAt: "2026-03-01T09:00:00Z" });
    const s = retentionState(back, n, at("2026-03-12T00:00:00Z"));
    expect(s.status).toBe("active");
    expect(s.clearOn).toBe("2027-05-01");
    expect(s.noticeSentAt).toBeNull();
  });

  it("waits for 6 months after the retirement date", () => {
    // Quiet for 13 months, but retiring 2026-06-01: nothing before 2026-12-01.
    const m = member({ retirementDate: "2026-06-01" });
    const s = retentionState(m, [], at("2026-02-15T00:00:00Z"));
    expect(s.status).toBe("quiet");
    expect(s.clearOn).toBe("2026-12-01");
    expect(retentionState(m, [], at("2026-10-02T00:00:00Z")).due).toEqual({ kind: "notice", clearOn: "2026-12-01" });
  });

  it("has nothing to clear for a member with no records, or Cleared once cleared", () => {
    expect(retentionState(member({ hasRecords: false }), [], at("2026-06-01T00:00:00Z"))).toMatchObject({ status: "nothing", due: null });
    expect(retentionState(member({ hasRecords: false, recordsClearedAt: "2026-03-11T00:00:00Z" }), [], at("2026-06-01T00:00:00Z")).status).toBe("cleared");
  });
});
