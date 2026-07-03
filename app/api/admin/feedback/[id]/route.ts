import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { notifyUserAdminResponse } from "@/lib/email";

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

  // Fetch email + original message before updating (needed for notification)
  const { data: existing } = await supabase
    .from("feedback")
    .select("email, feedback_type, message")
    .eq("id", id)
    .single();

  const { error } = await supabase
    .from("feedback")
    .update(updates)
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Notify user when admin posts/updates a response and they have an email
  const newResponse = (parsed.data.adminResponse ?? "").trim();
  if (newResponse && existing?.email) {
    void notifyUserAdminResponse({
      to: existing.email,
      ticketType: existing.feedback_type ?? "general",
      ticketMessage: existing.message ?? "",
      adminResponse: newResponse,
    }).catch((err) => console.error("User notify failed", err));
  }

  return NextResponse.json({ ok: true });
}
