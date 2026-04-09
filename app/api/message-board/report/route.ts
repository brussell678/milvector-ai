import { NextResponse } from "next/server";
import { z } from "zod";
import { MESSAGE_BOARD_REPORT_REASONS } from "@/lib/message-board";
import { supabaseServer } from "@/lib/supabase/server";

const CreateReportSchema = z.object({
  postId: z.string().uuid(),
  reason: z.enum(MESSAGE_BOARD_REPORT_REASONS),
  details: z.string().trim().max(1000).optional().nullable(),
});

export async function POST(req: Request) {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "You must be signed in to report content." }, { status: 401 });
    }

    const parsed = CreateReportSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid report payload." }, { status: 400 });
    }

    const { data: post, error: postError } = await supabase
      .from("message_board_posts")
      .select("id, user_id")
      .eq("id", parsed.data.postId)
      .maybeSingle();

    if (postError) return NextResponse.json({ error: postError.message }, { status: 500 });
    if (!post) return NextResponse.json({ error: "That post could not be found." }, { status: 404 });
    if (post.user_id === user.id) {
      return NextResponse.json({ error: "You cannot report your own post." }, { status: 400 });
    }

    const { error } = await supabase.from("message_board_reports").insert({
      post_id: parsed.data.postId,
      reported_by_user_id: user.id,
      reason: parsed.data.reason,
      details: parsed.data.details?.trim() || null,
    });

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "You have already reported this post." }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Message board report POST failed", error);
    return NextResponse.json({ error: "Unable to submit report." }, { status: 500 });
  }
}
