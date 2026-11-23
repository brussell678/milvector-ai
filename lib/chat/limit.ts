import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isAdminEmail } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { evaluateUsage } from "@/lib/usage-limit";

// Follow-up questions have their own budget (D4), counted per tool (D17):
// CHAT_DAILY_MESSAGE_LIMIT per member per tool in a rolling 24 hours, and
// CHAT_VA_DAILY_MESSAGE_LIMIT in the VA Rating Navigator, whose members claim
// 25 to 40 conditions. Counted from the tool_runs rows marked _chat, which the
// run limit leaves out (lib/usage-limit.ts), so asking questions never uses up
// a member's tool runs, and a long session in one chat never blocks another.

const WINDOW_MS = 24 * 60 * 60 * 1000;

export function chatLimitMessage(limit: number) {
  return `You've asked ${limit} follow-up questions today, this chat's daily limit. It frees up over the next 24 hours. Your chat and results are still here, and the tool itself still runs.`;
}

/** The daily follow-up limit for a tool's chat. */
export function chatLimitFor(toolName: string, env: { CHAT_DAILY_MESSAGE_LIMIT: number; CHAT_VA_DAILY_MESSAGE_LIMIT: number }): number {
  return toolName === "va_rating_navigator" ? env.CHAT_VA_DAILY_MESSAGE_LIMIT : env.CHAT_DAILY_MESSAGE_LIMIT;
}

/** A 429 reply when the member is over the follow-up budget, otherwise null. Fails open, like the run limit. */
export async function enforceChatLimit(args: { supabase: SupabaseClient; userId: string; email?: string | null; toolName: string }): Promise<NextResponse | null> {
  if (isAdminEmail(args.email)) return null;
  const limit = chatLimitFor(args.toolName, getEnv());
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const { count, error } = await args.supabase
    .from("tool_runs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", args.userId)
    .gte("created_at", since)
    .eq("tool_name", args.toolName)
    .eq("input_json->>_chat", "true");
  if (error) return null;
  if (evaluateUsage(count ?? 0, limit).allowed) return null;
  return NextResponse.json({ error: chatLimitMessage(limit), code: "chat_limit" }, { status: 429 });
}
