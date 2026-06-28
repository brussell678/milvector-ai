import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

type ParamsCtx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: ParamsCtx) {
  const { userId } = await requireUser();
  const { id } = await ctx.params;
  const supabase = await supabaseServer();

  const { data, error } = await supabase
    .from("tool_runs")
    .select("id, tool_name, output_json, created_at")
    .eq("id", id)
    .eq("user_id", userId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(data);
}
