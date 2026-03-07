import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const { userId } = await requireUser();
  const supabase = await supabaseServer();
  const url = new URL(req.url);
  const type = url.searchParams.get("type");
  const allowedTypes = new Set(["master_bullets", "master_resume", "targeted_resume"]);

  let query = supabase
    .from("resume_artifacts")
    .select("id,title,artifact_type,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (type && allowedTypes.has(type)) query = query.eq("artifact_type", type);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ artifacts: data ?? [] });
}
