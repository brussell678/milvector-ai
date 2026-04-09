import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/auth";
import { MESSAGE_BOARD_STARTER_THREADS } from "@/lib/message-board";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST() {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user || !isAdminEmail(user.email)) {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    const { data: existing, error: existingError } = await supabase
      .from("message_board_posts")
      .select("title")
      .is("parent_post_id", null)
      .in("title", MESSAGE_BOARD_STARTER_THREADS.map((thread) => thread.title));

    if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });

    const existingTitles = new Set((existing ?? []).map((item) => item.title));
    const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();

    const payload = MESSAGE_BOARD_STARTER_THREADS
      .filter((thread) => !existingTitles.has(thread.title))
      .map((thread) => ({
        user_id: user.id,
        title: thread.title,
        body: thread.body,
        author_label: profile?.full_name?.trim() || "MilVector Team",
        is_pinned: true,
      }));

    if (payload.length === 0) {
      return NextResponse.json({ ok: true, created: 0 });
    }

    const { error } = await supabase.from("message_board_posts").insert(payload);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, created: payload.length });
  } catch (error) {
    console.error("Starter thread seed failed", error);
    return NextResponse.json({ error: "Unable to seed starter threads." }, { status: 500 });
  }
}
