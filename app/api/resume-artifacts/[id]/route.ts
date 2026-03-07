import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

type ParamsCtx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: ParamsCtx) {
  const { userId } = await requireUser();
  const { id } = await ctx.params;
  const supabase = await supabaseServer();

  const body = await req.json().catch(() => ({}));
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title || title.length > 120) {
    return NextResponse.json({ error: "Invalid title" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("resume_artifacts")
    .update({ title })
    .eq("id", id)
    .eq("user_id", userId)
    .select("id,title")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ artifact: data });
}

export async function DELETE(_req: Request, ctx: ParamsCtx) {
  const { userId } = await requireUser();
  const { id } = await ctx.params;
  const supabase = await supabaseServer();

  const { error } = await supabase
    .from("resume_artifacts")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

