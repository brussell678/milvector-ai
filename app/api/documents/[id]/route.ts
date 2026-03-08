import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

const UpdateDocumentSchema = z.object({
  filename: z.string().trim().min(1).max(180).optional(),
  doc_type: z.enum(["FITREP", "EVAL", "VMET", "JST", "MASTER_RESUME", "RESUME_TEMPLATE", "OTHER"]).optional(),
});

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const { userId } = await requireUser();
  const { id } = await context.params;
  const supabase = await supabaseServer();

  const body = await req.json().catch(() => null);
  const parsed = UpdateDocumentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid update payload" }, { status: 400 });
  }

  const updates = Object.fromEntries(
    Object.entries(parsed.data).filter(([, value]) => value !== undefined)
  );
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("documents")
    .update(updates)
    .eq("id", id)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { userId } = await requireUser();
  const { id } = await context.params;
  const supabase = await supabaseServer();

  const { data: existing, error: existingError } = await supabase
    .from("documents")
    .select("id,storage_path")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  const { error: storageError } = await supabase.storage.from("documents").remove([existing.storage_path]);
  if (storageError) return NextResponse.json({ error: storageError.message }, { status: 500 });

  const { error: deleteError } = await supabase
    .from("documents")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
