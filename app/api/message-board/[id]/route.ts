import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminEmail } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

const UpdatePostSchema = z.object({
  title: z.string().trim().min(3).max(140).optional(),
  body: z.string().trim().min(3).max(4000).optional(),
  status: z.enum(["active", "hidden", "removed"]).optional(),
  isPinned: z.boolean().optional(),
  isLocked: z.boolean().optional(),
});

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = await supabaseServer();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isAdmin = isAdminEmail(user.email);
  const parsed = UpdatePostSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid update payload." }, { status: 400 });
  }

  const { data: existing, error: existingError } = await supabase
    .from("message_board_posts")
    .select("id, user_id, parent_post_id, is_locked")
    .eq("id", id)
    .maybeSingle();

  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "Post not found." }, { status: 404 });

  const updates: Record<string, unknown> = {};
  let threadLocked = existing.is_locked;

  if (existing.parent_post_id) {
    const { data: parent, error: parentError } = await supabase
      .from("message_board_posts")
      .select("id, is_locked")
      .eq("id", existing.parent_post_id)
      .maybeSingle();

    if (parentError) return NextResponse.json({ error: parentError.message }, { status: 500 });
    threadLocked = parent?.is_locked ?? false;
  }

  if (parsed.data.body !== undefined || parsed.data.title !== undefined) {
    if (existing.user_id !== user.id && !isAdmin) {
      return NextResponse.json({ error: "You can only edit your own posts." }, { status: 403 });
    }
    if (threadLocked && !isAdmin) {
      return NextResponse.json({ error: "Locked threads cannot be edited." }, { status: 403 });
    }
    if (parsed.data.body !== undefined) updates.body = parsed.data.body;
    if (parsed.data.title !== undefined && !existing.parent_post_id) updates.title = parsed.data.title;
    updates.edited_at = new Date().toISOString();
  }

  if (parsed.data.status !== undefined || parsed.data.isPinned !== undefined || parsed.data.isLocked !== undefined) {
    if (!isAdmin) {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }
    if (parsed.data.status !== undefined) updates.status = parsed.data.status;
    if (parsed.data.isPinned !== undefined) updates.is_pinned = parsed.data.isPinned;
    if (parsed.data.isLocked !== undefined) updates.is_locked = parsed.data.isLocked;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update." }, { status: 400 });
  }

  const { error: updateError } = await supabase
    .from("message_board_posts")
    .update(updates)
    .eq("id", id);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = await supabaseServer();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isAdmin = isAdminEmail(user.email);
  const { data: existing, error: existingError } = await supabase
    .from("message_board_posts")
    .select("id, user_id, parent_post_id, is_locked")
    .eq("id", id)
    .maybeSingle();

  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "Post not found." }, { status: 404 });
  if (existing.user_id !== user.id && !isAdmin) {
    return NextResponse.json({ error: "You can only delete your own posts." }, { status: 403 });
  }
  if (!isAdmin) {
    let threadLocked = existing.is_locked;
    if (existing.parent_post_id) {
      const { data: parent, error: parentError } = await supabase
        .from("message_board_posts")
        .select("id, is_locked")
        .eq("id", existing.parent_post_id)
        .maybeSingle();
      if (parentError) return NextResponse.json({ error: parentError.message }, { status: 500 });
      threadLocked = parent?.is_locked ?? false;
    }
    if (threadLocked) {
      return NextResponse.json({ error: "Locked threads cannot be deleted." }, { status: 403 });
    }
  }

  const { error: deleteError } = await supabase.from("message_board_posts").delete().eq("id", id);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
