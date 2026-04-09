import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

const UpdateReportSchema = z.object({
  status: z.enum(["open", "reviewed", "dismissed", "actioned"]),
  moderatorNotes: z.string().trim().max(1000).optional().nullable(),
});

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const admin = await requireAdmin();
    const supabase = await supabaseServer();

    const parsed = UpdateReportSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid report update." }, { status: 400 });
    }

    const { error } = await supabase
      .from("message_board_reports")
      .update({
        status: parsed.data.status,
        moderator_notes: parsed.data.moderatorNotes?.trim() || null,
        reviewed_at: new Date().toISOString(),
        reviewed_by_user_id: admin.userId,
      })
      .eq("id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Response) {
      return NextResponse.json({ error: error.status === 403 ? "Admin access required." : "Unauthorized." }, { status: error.status });
    }
    console.error("Admin message board report PATCH failed", error);
    return NextResponse.json({ error: "Unable to update report." }, { status: 500 });
  }
}
