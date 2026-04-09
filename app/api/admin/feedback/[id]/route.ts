import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

const UpdateFeedbackSchema = z.object({
  status: z.enum(["new", "reviewing", "resolved", "archived"]).optional(),
  adminResponse: z.string().trim().max(4000).optional().nullable(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const supabase = await supabaseServer();
  const { id } = await params;

  const parsed = UpdateFeedbackSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid status update." }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.status !== undefined) updates.status = parsed.data.status;
  if (parsed.data.adminResponse !== undefined) {
    updates.admin_response = parsed.data.adminResponse?.trim() || null;
    updates.admin_response_updated_at = parsed.data.adminResponse?.trim() ? new Date().toISOString() : null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No feedback fields to update." }, { status: 400 });
  }

  const { error } = await supabase
    .from("feedback")
    .update(updates)
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
