import { NextResponse } from "next/server";
import { authReplies, requireUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

type ParamsCtx = { params: Promise<{ id: string }> };

async function handlePATCH(req: Request, ctx: ParamsCtx) {
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

async function handleDELETE(_req: Request, ctx: ParamsCtx) {
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

export const PATCH = authReplies(handlePATCH);
export const DELETE = authReplies(handleDELETE);
