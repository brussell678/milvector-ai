import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";

const VoteSchema = z.object({
  postId: z.string().uuid(),
  value: z.union([z.literal(1), z.literal(-1)]),
});

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "You must be signed in to vote." }, { status: 401 });
  }

  const parsed = VoteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  }

  const { postId, value } = parsed.data;

  const { data: existingVote, error: existingError } = await supabase
    .from("message_board_votes")
    .select("vote_value")
    .eq("post_id", postId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });

  if (existingVote?.vote_value === value) {
    const { error } = await supabase
      .from("message_board_votes")
      .delete()
      .eq("post_id", postId)
      .eq("user_id", user.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, userVote: 0 });
  }

  const { error } = await supabase.from("message_board_votes").upsert(
    {
      post_id: postId,
      user_id: user.id,
      vote_value: value,
    },
    { onConflict: "post_id,user_id" }
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, userVote: value });
}
