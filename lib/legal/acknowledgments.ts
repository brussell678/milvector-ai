import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { ACK_NEEDED_MESSAGE, DECISION_NOTICE_VERSION, type AckTool } from "@/lib/legal/decision-notice";

// Whether a member has confirmed the Decide notice for a tool, at its current
// version (tool_acknowledgments, migration 0045). "unavailable" means the
// table cannot be read, as before 0045 runs: the tools then work as they did,
// with the notice shown but not confirmed, rather than locking members out.

export type AckStatus = "done" | "needed" | "unavailable";

export async function ackStatus(supabase: SupabaseClient, userId: string, tool: AckTool): Promise<AckStatus> {
  const { data, error } = await supabase
    .from("tool_acknowledgments")
    .select("tool")
    .eq("user_id", userId)
    .eq("tool", tool)
    .eq("notice_version", DECISION_NOTICE_VERSION)
    .limit(1);
  if (error) return "unavailable";
  return (data ?? []).length > 0 ? "done" : "needed";
}

/** A 428 reply when the member has not confirmed the notice; null when they have (or the table is not there yet). */
export async function ackReply(supabase: SupabaseClient, userId: string, tool: AckTool): Promise<NextResponse | null> {
  return (await ackStatus(supabase, userId, tool)) === "needed"
    ? NextResponse.json({ error: ACK_NEEDED_MESSAGE, code: "ack_required" }, { status: 428 })
    : null;
}
