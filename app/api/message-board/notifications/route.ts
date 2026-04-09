import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("message_board_notifications")
      .select("id, post_id, notification_type, message, read_at, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      notifications:
        data?.map((item) => ({
          id: item.id,
          postId: item.post_id,
          type: item.notification_type,
          message: item.message,
          readAt: item.read_at,
          createdAt: item.created_at,
        })) ?? [],
    });
  } catch (error) {
    console.error("Message board notifications GET failed", error);
    return NextResponse.json({ error: "Unable to load notifications." }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const ids = Array.isArray(body?.ids) ? body.ids.filter((value: unknown): value is string => typeof value === "string") : [];

    let query = supabase
      .from("message_board_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .is("read_at", null);

    if (ids.length > 0) {
      query = query.in("id", ids);
    }

    const { error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Message board notifications PATCH failed", error);
    return NextResponse.json({ error: "Unable to update notifications." }, { status: 500 });
  }
}
