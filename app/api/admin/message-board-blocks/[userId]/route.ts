import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

export async function DELETE(_req: Request, context: { params: Promise<{ userId: string }> }) {
  try {
    await requireAdmin();
    const { userId } = await context.params;
    const supabase = await supabaseServer();

    const { error } = await supabase.from("message_board_blocked_users").delete().eq("user_id", userId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Response) {
      return NextResponse.json({ error: error.status === 403 ? "Admin access required." : "Unauthorized." }, { status: error.status });
    }
    console.error("Message board block DELETE failed", error);
    return NextResponse.json({ error: "Unable to remove posting block." }, { status: 500 });
  }
}
