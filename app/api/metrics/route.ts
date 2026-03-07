import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET() {
  const { userId } = await requireUser();
  const supabase = await supabaseServer();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [masterCountRes, targetedCountRes, toolRunSuccessRes, toolRunErrorRes, firstSuccessRes, firstTargetedRes] =
    await Promise.all([
      supabase
        .from("resume_artifacts")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .in("artifact_type", ["master_resume", "master_bullets"]),
      supabase
        .from("resume_artifacts")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("artifact_type", "targeted_resume"),
      supabase
        .from("tool_runs")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("status", "success"),
      supabase
        .from("tool_runs")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("status", "error"),
      supabase
        .from("tool_runs")
        .select("created_at")
        .eq("user_id", userId)
        .eq("status", "success")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("resume_artifacts")
        .select("created_at")
        .eq("user_id", userId)
        .eq("artifact_type", "targeted_resume")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);

  const accountCreatedAt = user?.created_at ? new Date(user.created_at).getTime() : null;
  const firstValueCandidates = [firstSuccessRes.data?.created_at, firstTargetedRes.data?.created_at]
    .filter(Boolean)
    .map((value) => new Date(value as string).getTime());
  const firstValueAtMs = firstValueCandidates.length ? Math.min(...firstValueCandidates) : null;
  const timeToFirstValueMinutes =
    accountCreatedAt && firstValueAtMs ? Math.round((firstValueAtMs - accountCreatedAt) / 60000) : null;

  return NextResponse.json({
    generatedMasterResume: (masterCountRes.count ?? 0) > 0,
    generatedTargetedResume: (targetedCountRes.count ?? 0) > 0,
    masterResumeCount: masterCountRes.count ?? 0,
    targetedResumesCount: targetedCountRes.count ?? 0,
    toolRunSuccessCount: toolRunSuccessRes.count ?? 0,
    toolRunErrorCount: toolRunErrorRes.count ?? 0,
    timeToFirstValueMinutes,
    timeToFirstValueUnder10Min:
      typeof timeToFirstValueMinutes === "number" ? timeToFirstValueMinutes <= 10 : null,
  });
}
