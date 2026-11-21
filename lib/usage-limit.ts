import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isAdminEmail } from "@/lib/auth";
import { getEnv } from "@/lib/env";

// Per-user ceiling on AI runs in a rolling 24 hours. MilVector is free and the
// AI is paid for out of pocket, so one account must not be able to drain it.
// Counted from tool_runs, which every AI route already writes, so there is no
// separate counter to keep in sync. A run is one member action: the internal
// calls inside it (logged with _step, such as the Targeted Resume Builder's
// rewrite batches) are not counted again.

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
}): Promise<NextResponse | null> {
  if (isAdminEmail(args.email)) return null;

  const limit = getEnv().AI_DAILY_RUN_LIMIT;
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const { count, error } = await args.supabase
    .from("tool_runs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", args.userId)
    .gte("created_at", since)
    .is("input_json->>_step", null);

  if (error) return null;

  const decision = evaluateUsage(count ?? 0, limit);
  if (decision.allowed) return null;

  return NextResponse.json({ error: usageLimitMessage(limit), code: "usage_limit" }, { status: 429 });
}
