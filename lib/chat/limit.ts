import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isAdminEmail } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { evaluateUsage } from "@/lib/usage-limit";

// Follow-up questions have their own budget (D4): CHAT_DAILY_MESSAGE_LIMIT per
// member in a rolling 24 hours, counted from the tool_runs rows marked _chat.
// Those rows are left out of the run limit (lib/usage-limit.ts), so asking
// questions never uses up a member's tool runs.

const WINDOW_MS = 24 * 60 * 60 * 1000;

export function chatLimitMessage(limit: number) {
  return `You've asked ${limit} follow-up questions today, the daily limit. It frees up over the next 24 hours. Your chat and results are still here, and the tool itself still runs.`;
}

/** A 429 reply when the member is over the follow-up budget, otherwise null. Fails open, like the run limit. */
export async function enforceChatLimit(args: { supabase: SupabaseClient; userId: string; email?: string | null }): Promise<NextResponse | null> {
  if (isAdminEmail(args.email)) return null;
  const limit = getEnv().CHAT_DAILY_MESSAGE_LIMIT;
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const { count, error } = await args.supabase
    .from("tool_runs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", args.userId)
    .gte("created_at", since)
    .eq("input_json->>_chat", "true");
  if (error) return null;
  if (evaluateUsage(count ?? 0, limit).allowed) return null;
  return NextResponse.json({ error: chatLimitMessage(limit), code: "chat_limit" }, { status: 429 });
}
