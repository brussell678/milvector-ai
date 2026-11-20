import { NextResponse } from "next/server";
import { ownedInvite } from "@/lib/invites/owner";

type Params = { params: Promise<{ id: string; photoId: string }> };

// Changes a photo's caption.
export async function PATCH(req: Request, { params }: Params) {
  const { id, photoId } = await params;
  const auth = await ownedInvite(id, photoId);
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const body = (await req.json().catch(() => null)) as { caption?: unknown } | null;
  const caption = String(body?.caption ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();
  if (caption.length > 120) return NextResponse.json({ error: "Keep captions under 120 characters." }, { status: 400 });
  const { data, error } = await supabase
    .from("retirement_invite_photos")
    .update({ caption })
    .eq("id", photoId)
    .eq("invite_id", id)
    .select("id,position,caption,updated_at")
    .maybeSingle<{ id: string; position: number; caption: string; updated_at: string }>();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ photo: { id: data.id, position: data.position, caption: data.caption, updatedAt: data.updated_at } });
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id, photoId } = await params;
  const auth = await ownedInvite(id, photoId);
  if ("error" in auth) return auth.error;
  const { supabase } = auth;
  const { error } = await supabase.from("retirement_invite_photos").delete().eq("id", photoId).eq("invite_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
