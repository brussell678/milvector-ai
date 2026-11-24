import { readFileSync } from "node:fs";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { ackReply, ackStatus } from "@/lib/legal/acknowledgments";
import { ACK_LABEL, ACK_NEEDED_MESSAGE, ACK_TOOLS, DECISION_NOTICE_VERSION, decisionNotice } from "@/lib/legal/decision-notice";

// A stand-in for the one query ackStatus makes.
function fakeSupabase(result: { data: unknown[] | null; error: { message: string } | null }) {
  const calls: Record<string, unknown>[] = [];
  const query = {
    select: () => query,
    eq: (column: string, value: unknown) => {
      calls.push({ [column]: value });
      return query;
    },
    limit: async () => result,
  };
  return { client: { from: () => query } as unknown as SupabaseClient, calls };
}

describe("the Decide notice", () => {
  it("says the approved words, with each tool's own line", () => {
    for (const tool of ["calculator", "va", "sbp"] as const) {
      expect(decisionNotice(tool)).toMatch(/^Educational information only\. MilVector provides estimates and general information to help you prepare\. It is not financial, tax, legal, or medical advice, and your decisions remain your own\. /);
    }
    expect(decisionNotice("calculator")).toContain("DFAS and VA determine your actual pay.");
    expect(decisionNotice("va")).toContain("VA alone decides ratings. MilVector is not affiliated with VA or accredited to represent you; an accredited VSO can help you file for free.");
    expect(decisionNotice("sbp")).toContain("Your election is generally permanent. Confirm it with your installation retirement services officer before you sign the DD Form 2656.");
  });

  it("has no em or en dashes in anything a member reads", () => {
    for (const text of [decisionNotice("calculator"), decisionNotice("va"), decisionNotice("sbp"), ACK_LABEL, ACK_NEEDED_MESSAGE]) expect(text).not.toMatch(/[—–]/);
  });

  it("asks only on the tools migration 0045 allows", () => {
    const sql = readFileSync(path.join(process.cwd(), "supabase", "migrations", "0045_tool_acknowledgments.sql"), "utf8");
    expect(sql).toContain(`check (tool in (${ACK_TOOLS.map((t) => `'${t}'`).join(", ")}))`);
    expect(DECISION_NOTICE_VERSION).toBeGreaterThan(0);
  });
});

describe("confirming the notice", () => {
  it("is done when the member confirmed this version", async () => {
    const { client, calls } = fakeSupabase({ data: [{ tool: "va" }], error: null });
    expect(await ackStatus(client, "u1", "va")).toBe("done");
    expect(calls).toEqual([{ user_id: "u1" }, { tool: "va" }, { notice_version: DECISION_NOTICE_VERSION }]);
    expect(await ackReply(client, "u1", "va")).toBeNull();
  });

  it("is needed when there is no record, and the route then answers 428", async () => {
    const { client } = fakeSupabase({ data: [], error: null });
    expect(await ackStatus(client, "u1", "sbp")).toBe("needed");
    const reply = await ackReply(client, "u1", "sbp");
    expect(reply?.status).toBe(428);
    expect(await reply?.json()).toEqual({ error: ACK_NEEDED_MESSAGE, code: "ack_required" });
  });

  it("does not lock anyone out when the records cannot be read (before 0045)", async () => {
    const { client } = fakeSupabase({ data: null, error: { message: 'relation "public.tool_acknowledgments" does not exist' } });
    expect(await ackStatus(client, "u1", "va")).toBe("unavailable");
    expect(await ackReply(client, "u1", "va")).toBeNull();
  });
});
