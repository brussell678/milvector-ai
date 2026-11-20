import { NextResponse } from "next/server";
import { inviteBuilderEnabled } from "@/lib/invites/access";
import { supabaseServer } from "@/lib/supabase/server";

// Shared check for the owner's invitation routes: signed in, allowed to use
// the builder, and the invitation is theirs.

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const PHASE_C_NOT_READY = "This part is not set up yet. Run migration 0034_invite_phase_c.sql in the Supabase SQL editor.";

export async function ownedInvite(id: string, ...otherIds: string[]) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Sign in to continue." }, { status: 401 }) } as const;
  if (!inviteBuilderEnabled(user.email) || ![id, ...otherIds].every((value) => UUID_RE.test(value))) {
    return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) } as const;
  }
  const { data: invite } = await supabase.from("retirement_invites").select("id,slug,data").eq("id", id).eq("user_id", user.id).maybeSingle<{ id: string; slug: string; data: unknown }>();
  if (!invite) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) } as const;
  return { supabase, user, invite } as const;
}
