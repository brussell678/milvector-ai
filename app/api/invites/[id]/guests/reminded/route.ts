import { NextResponse } from "next/server";
import { UUID_RE, ownedInvite } from "@/lib/invites/owner";

// The host marks a reminder as sent to these guests. MilVector sent nothing;
// this only records it, so the host can see who has been reminded.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await ownedInvite(id);
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const body = (await req.json().catch(() => null)) as { ids?: unknown } | null;
  const ids = Array.isArray(body?.ids) ? body.ids.map(String).filter((value) => UUID_RE.test(value)).slice(0, 500) : [];
  if (ids.length === 0) return NextResponse.json({ error: "Nobody to mark." }, { status: 400 });
  const at = new Date().toISOString();
  const { data, error } = await supabase.from("retirement_invite_guests").update({ last_reminded_at: at }).eq("invite_id", id).in("id", ids).select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ marked: (data ?? []).length, at });
}
