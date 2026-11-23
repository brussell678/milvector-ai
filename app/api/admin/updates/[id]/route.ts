import { NextResponse } from "next/server";
import { z } from "zod";
import { authReplies, requireAdmin } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

// Edits a draft's wording or publishes it. Drafts arrive from WHATSNEW.md
// entries tagged {draft}; members see nothing until the admin publishes here.
// A published update is not pulled back to a draft.
const ChangeSchema = z
  .object({
    title: z.string().trim().min(3, "The title needs at least 3 characters.").max(160).optional(),
    body: z.string().trim().min(10, "The text needs at least 10 characters.").max(4000).optional(),
    category: z.enum(["new", "improvement", "fix"]).optional(),
    published: z.literal(true).optional(),
  })
  .refine((change) => Object.keys(change).length > 0, "Nothing to change.");

async function handlePATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const supabase = await supabaseServer();
  const { id } = await params;

  const parsed = ChangeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid change." }, { status: 400 });
  }

  const change: Record<string, unknown> = { ...parsed.data };
  // The announcement bar shows an update for 21 days from published_at, so
  // publishing a draft starts that clock now, not when the draft was made.
  if (parsed.data.published) change.published_at = new Date().toISOString();

  const { data, error } = await supabase.from("product_updates").update(change).eq("id", id).select("id").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "That update no longer exists." }, { status: 404 });
  return NextResponse.json({ ok: true });
}

async function handleDELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const supabase = await supabaseServer();
  const { id } = await params;

  const { error } = await supabase.from("product_updates").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export const PATCH = authReplies(handlePATCH);
export const DELETE = authReplies(handleDELETE);
