import { NextResponse } from "next/server";
import { ownedInvite } from "@/lib/invites/owner";

// The host removes a message left on the day.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; messageId: string }> }) {
  const { id, messageId } = await params;
  const auth = await ownedInvite(id, messageId);
  if ("error" in auth) return auth.error;
  const { supabase } = auth;
  const { error } = await supabase.from("retirement_invite_messages").delete().eq("id", messageId).eq("invite_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
