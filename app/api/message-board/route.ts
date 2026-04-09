import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminEmail } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

const CreateMessageSchema = z.object({
  title: z.string().trim().min(3).max(140).optional(),
  body: z.string().trim().min(3).max(4000),
  parentPostId: z.string().uuid().optional().nullable(),
});

function getAuthorLabel(email?: string | null) {
  if (!email) return "Anonymous";

  const localPart = email.split("@")[0] ?? "Anonymous";
  return localPart.replace(/[._-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60) || "Anonymous";
}

export async function GET() {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const isAdmin = isAdminEmail(user?.email);
    let hasSavedProfile = false;

    if (user) {
      const { data: profile } = await supabase.from("profiles").select("id").eq("id", user.id).maybeSingle();
      hasSavedProfile = !!profile;
    }

    let postsQuery = supabase
      .from("message_board_posts")
      .select("id, user_id, parent_post_id, title, body, author_label, created_at, status, is_pinned, is_locked, last_activity_at, edited_at")
      .order("created_at", { ascending: false });

    if (!isAdmin) {
      postsQuery = postsQuery.eq("status", "active");
    }

    const [{ data: posts, error: postsError }, { data: votes, error: votesError }] = await Promise.all([
      postsQuery,
      supabase.from("message_board_votes").select("post_id, user_id, vote_value"),
    ]);

    if (postsError) return NextResponse.json({ error: postsError.message }, { status: 500 });
    if (votesError) return NextResponse.json({ error: votesError.message }, { status: 500 });

    const scoreByPostId = new Map<string, number>();
    const userVoteByPostId = new Map<string, number>();

    for (const vote of votes ?? []) {
      scoreByPostId.set(vote.post_id, (scoreByPostId.get(vote.post_id) ?? 0) + vote.vote_value);
      if (user?.id && vote.user_id === user.id) {
        userVoteByPostId.set(vote.post_id, vote.vote_value);
      }
    }

    const enrichedPosts = (posts ?? []).map((post) => ({
      id: post.id,
      userId: post.user_id,
      parentPostId: post.parent_post_id,
      title: post.title,
      body: post.body,
      authorLabel: post.author_label,
      createdAt: post.created_at,
      status: post.status,
      isPinned: post.is_pinned,
      isLocked: post.is_locked,
      lastActivityAt: post.last_activity_at,
      editedAt: post.edited_at,
      score: scoreByPostId.get(post.id) ?? 0,
      userVote: userVoteByPostId.get(post.id) ?? 0,
    }));

    return NextResponse.json({
      posts: enrichedPosts,
      canPost: hasSavedProfile,
      requiresSavedProfile: true,
      isAdmin,
      currentUserId: user?.id ?? null,
    });
  } catch (error) {
    console.error("Message board GET failed", error);
    return NextResponse.json({ error: "Unable to load the message board." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "You must be signed in to post." }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, full_name")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    if (!profile) {
      return NextResponse.json({ error: "Save your MilVector profile before posting on the message board." }, { status: 403 });
    }

    const parsed = CreateMessageSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
    }

    const parentPostId = parsed.data.parentPostId ?? null;
    if (!parentPostId && !parsed.data.title) {
      return NextResponse.json({ error: "A title is required for new posts." }, { status: 400 });
    }

    if (parentPostId) {
      const { data: parent, error: parentError } = await supabase
        .from("message_board_posts")
        .select("id, parent_post_id, is_locked, status")
        .eq("id", parentPostId)
        .maybeSingle();

      if (parentError) return NextResponse.json({ error: parentError.message }, { status: 500 });
      if (!parent) return NextResponse.json({ error: "Reply target was not found." }, { status: 404 });
      if (parent.parent_post_id) {
        return NextResponse.json({ error: "Replies can only be added to top-level posts." }, { status: 400 });
      }
      if (parent.status !== "active") {
        return NextResponse.json({ error: "You cannot reply to this thread." }, { status: 400 });
      }
      if (parent.is_locked) {
        return NextResponse.json({ error: "This thread is locked." }, { status: 400 });
      }
    }

    const payload = {
      user_id: user.id,
      parent_post_id: parentPostId,
      title: parentPostId ? null : parsed.data.title,
      body: parsed.data.body,
      author_label: profile.full_name?.trim() || getAuthorLabel(user.email),
    };

    const { error } = await supabase.from("message_board_posts").insert(payload);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (parentPostId) {
      await supabase
        .from("message_board_posts")
        .update({ last_activity_at: new Date().toISOString() })
        .eq("id", parentPostId);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Message board POST failed", error);
    return NextResponse.json({ error: "Unable to create post." }, { status: 500 });
  }
}
