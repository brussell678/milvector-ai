import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isAdminEmail } from "@/lib/auth";
import { getEnv } from "@/lib/env";

// Per-user ceiling on AI runs in a rolling 24 hours. MilVector is free and the
// AI is paid for out of pocket, so one account must not be able to drain it.
// Counted from tool_runs, which every AI route already writes, so there is no
// separate counter to keep in sync. A run is one member action: the internal
// calls inside it (logged with _step, such as the Targeted Resume Builder's
// rewrite batches) are not counted again. Follow-up questions in the chat
// tools (logged with _chat) have their own budget in lib/chat/limit.ts.

const WINDOW_MS = 24 * 60 * 60 * 1000;

export type UsageDecision = {
  allowed: boolean;
  used: number;
  limit: number;
  remaining: number;
};

export function evaluateUsage(used: number, limit: number): UsageDecision {
  const safeUsed = Math.max(0, used);
  return {
    allowed: safeUsed < limit,
    used: safeUsed,
    limit,
    remaining: Math.max(0, limit - safeUsed),
  };
}

// Tools with their own daily run budget, apart from the runs every other tool
// shares (D18). Their runs are counted only against their own budget.
export const OWN_BUDGET_TOOLS = ["va_rating_navigator"] as const;

export type RunBudget = { tool: string | null; excluded: string[]; limit: "VA_DAILY_RUN_LIMIT" | "AI_DAILY_RUN_LIMIT" };

/** Which runs a tool's run counts against, and which setting is its limit. */
export function runBudget(tool?: string | null): RunBudget {
  if (tool && (OWN_BUDGET_TOOLS as readonly string[]).includes(tool)) return { tool, excluded: [], limit: "VA_DAILY_RUN_LIMIT" };
  return { tool: null, excluded: [...OWN_BUDGET_TOOLS], limit: "AI_DAILY_RUN_LIMIT" };
}

export function vaLimitMessage(limit: number) {
  return `You've reached today's limit of ${limit} VA analyses and code lookups. It frees up over the next 24 hours, and your conditions and analyses are still here.`;
}

export function usageLimitMessage(limit: number) {
  return `You've reached today's limit of ${limit} AI runs. The limit keeps MilVector free for everyone. It frees up over the next 24 hours, and your saved work is untouched.`;
}

/**
 * Returns a 429 response when the user is over the limit, otherwise null.
 * Fails open: if the count cannot be read, the run is allowed, because blocking
 * a service member on our own bookkeeping error is the worse failure.
 */
export async function enforceAiUsageLimit(args: {
  supabase: SupabaseClient;
  userId: string;
  email?: string | null;
  // A tool with its own budget (OWN_BUDGET_TOOLS) is counted on its own.
  tool?: string;
}): Promise<NextResponse | null> {
  if (isAdminEmail(args.email)) return null;

  const budget = runBudget(args.tool);
  const limit = getEnv()[budget.limit];
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  let query = args.supabase
    .from("tool_runs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", args.userId)
    .gte("created_at", since)
    .is("input_json->>_step", null)
    .is("input_json->>_chat", null);
  if (budget.tool) query = query.eq("tool_name", budget.tool);
  for (const excluded of budget.excluded) query = query.neq("tool_name", excluded);
  const { count, error } = await query;

  if (error) return null;

  const decision = evaluateUsage(count ?? 0, limit);
  if (decision.allowed) return null;

  return NextResponse.json({ error: budget.tool ? vaLimitMessage(limit) : usageLimitMessage(limit), code: "usage_limit" }, { status: 429 });
}
