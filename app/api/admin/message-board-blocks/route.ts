import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

const CreateBlockSchema = z.object({
  userId: z.string().uuid(),
  reason: z.string().trim().max(500).optional().nullable(),
});

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin();
    const supabase = await supabaseServer();
    const parsed = CreateBlockSchema.safeParse(await req.json().catch(() => null));

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid block payload." }, { status: 400 });
    }

    const { error } = await supabase.from("message_board_blocked_users").upsert({
      user_id: parsed.data.userId,
      reason: parsed.data.reason?.trim() || null,
      blocked_by_user_id: admin.userId,
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Response) {
      return NextResponse.json({ error: error.status === 403 ? "Admin access required." : "Unauthorized." }, { status: error.status });
    }
    console.error("Message board block POST failed", error);
    return NextResponse.json({ error: "Unable to block this user." }, { status: 500 });
  }
}
