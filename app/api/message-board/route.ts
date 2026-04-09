import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminEmail } from "@/lib/auth";
import { getMessageBoardLinkOption, normalizeMessageBoardText } from "@/lib/message-board";
import { supabaseServer } from "@/lib/supabase/server";

const CreateMessageSchema = z.object({
  title: z.string().trim().min(3).max(140).optional(),
  body: z.string().trim().min(3).max(4000),
  parentPostId: z.string().uuid().optional().nullable(),
  linkKey: z.string().trim().min(1).max(80).optional().nullable(),
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
    let postingBlocked = false;
    let postingBlockReason: string | null = null;

    if (user) {
      const [{ data: profile }, { data: blockedUser }] = await Promise.all([
        supabase.from("profiles").select("id").eq("id", user.id).maybeSingle(),
        supabase.from("message_board_blocked_users").select("reason").eq("user_id", user.id).maybeSingle(),
      ]);
      hasSavedProfile = !!profile;
      postingBlocked = !!blockedUser;
      postingBlockReason = blockedUser?.reason ?? null;
    }

    let postsQuery = supabase
      .from("message_board_posts")
      .select("id, user_id, parent_post_id, title, body, author_label, created_at, status, is_pinned, is_locked, last_activity_at, edited_at, linked_tool_slug, linked_resource_type, linked_resource_path, linked_resource_label")
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
      linkedToolSlug: post.linked_tool_slug,
      linkedResourceType: post.linked_resource_type,
      linkedResourcePath: post.linked_resource_path,
      linkedResourceLabel: post.linked_resource_label,
      score: scoreByPostId.get(post.id) ?? 0,
      userVote: userVoteByPostId.get(post.id) ?? 0,
    }));

    return NextResponse.json({
      posts: enrichedPosts,
      canPost: hasSavedProfile && !postingBlocked,
      requiresSavedProfile: true,
      postingBlocked,
      postingBlockReason,
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
    const { data: blockedUser, error: blockedUserError } = await supabase
      .from("message_board_blocked_users")
      .select("reason")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }
    if (blockedUserError) {
      return NextResponse.json({ error: blockedUserError.message }, { status: 500 });
    }

    if (!profile) {
      return NextResponse.json({ error: "Save your MilVector profile before posting on the message board." }, { status: 403 });
    }
    if (blockedUser) {
      return NextResponse.json({ error: blockedUser.reason?.trim() || "Your account is currently blocked from posting on the message board." }, { status: 403 });
    }

    const parsed = CreateMessageSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
    }

    const parentPostId = parsed.data.parentPostId ?? null;
    const linkOption = getMessageBoardLinkOption(parsed.data.linkKey ?? null);
    if (!parentPostId && !parsed.data.title) {
      return NextResponse.json({ error: "A title is required for new posts." }, { status: 400 });
    }
    if (parentPostId && parsed.data.linkKey) {
      return NextResponse.json({ error: "Replies cannot attach a linked tool or resource." }, { status: 400 });
    }
    if (parsed.data.linkKey && !linkOption) {
      return NextResponse.json({ error: "The selected tool or resource link is not available." }, { status: 400 });
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

    const minimumTextLength = parentPostId ? 10 : 24;
    if (normalizeMessageBoardText(parsed.data.body).length < minimumTextLength) {
      return NextResponse.json(
        { error: parentPostId ? "Replies should include a little more context before posting." : "Posts should include enough detail to help the community respond." },
        { status: 400 }
      );
    }

    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: recentPosts, error: recentPostsError } = await supabase
      .from("message_board_posts")
      .select("id, title, body, created_at, parent_post_id")
      .eq("user_id", user.id)
      .gte("created_at", tenMinutesAgo)
      .order("created_at", { ascending: false });

    if (recentPostsError) {
      return NextResponse.json({ error: recentPostsError.message }, { status: 500 });
    }

    const latestPost = recentPosts?.[0];
    if (latestPost && Date.now() - new Date(latestPost.created_at).getTime() < 20_000) {
      return NextResponse.json({ error: "Give the board a few seconds between posts so the feed stays readable." }, { status: 429 });
    }

    const recentTopLevelCount = (recentPosts ?? []).filter((post) => !post.parent_post_id).length;
    const recentReplyCount = (recentPosts ?? []).filter((post) => !!post.parent_post_id).length;
    if (!parentPostId && recentTopLevelCount >= 3) {
      return NextResponse.json({ error: "You have posted several new threads recently. Give the current ones time to breathe before starting another." }, { status: 429 });
    }
    if (parentPostId && recentReplyCount >= 6) {
      return NextResponse.json({ error: "You have replied a lot in a short window. Pause for a bit before posting another reply." }, { status: 429 });
    }

    const normalizedTitle = normalizeMessageBoardText(parsed.data.title ?? "");
    const normalizedBody = normalizeMessageBoardText(parsed.data.body);
    const duplicate = (recentPosts ?? []).some((post) => {
      const matchesTitle = normalizeMessageBoardText(post.title ?? "") === normalizedTitle;
      const matchesBody = normalizeMessageBoardText(post.body) === normalizedBody;
      return parentPostId ? matchesBody : matchesTitle && matchesBody;
    });
    if (duplicate) {
      return NextResponse.json({ error: "This looks like a duplicate of something you already posted recently." }, { status: 409 });
    }

    const payload = {
      user_id: user.id,
      parent_post_id: parentPostId,
      title: parentPostId ? null : parsed.data.title,
      body: parsed.data.body,
      author_label: profile.full_name?.trim() || getAuthorLabel(user.email),
      linked_tool_slug: parentPostId ? null : linkOption?.toolSlug ?? null,
      linked_resource_type: parentPostId ? null : linkOption?.resourceType ?? null,
      linked_resource_path: parentPostId ? null : linkOption?.path ?? null,
      linked_resource_label: parentPostId ? null : linkOption?.label ?? null,
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
