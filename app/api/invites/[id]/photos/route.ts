import { NextResponse } from "next/server";
import { z } from "zod";
import { isMissingSchema } from "@/lib/cards/store";
import { captionProblem } from "@/lib/invites/opsec";
import { PHASE_C_NOT_READY, UUID_RE, ownedInvite } from "@/lib/invites/owner";
import { MAX_PHOTOS, validCover } from "@/lib/invites/schema";

type Params = { params: Promise<{ id: string }> };

const caption = z
  .string()
  .max(120)
  .transform((v) => v.replace(/[\u0000-\u001f\u007f]/g, "").trim());

const present = (row: { id: string; position: number; caption: string; updated_at: string }) => ({
  id: row.id,
  position: row.position,
  caption: row.caption,
  updatedAt: row.updated_at,
});

// Adds a career photo, already shrunk in the browser to a JPEG.
export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const auth = await ownedInvite(id);
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  const body = (await req.json().catch(() => null)) as { jpeg?: unknown; caption?: unknown } | null;
  const jpeg = String(body?.jpeg ?? "");
  if (!validCover(jpeg)) return NextResponse.json({ error: "That photo could not be used. Try a different image." }, { status: 400 });
  const text = caption.safeParse(String(body?.caption ?? ""));
  if (!text.success) return NextResponse.json({ error: "Keep captions under 120 characters." }, { status: 400 });
  const problem = captionProblem(text.data);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const { data: last } = await supabase.from("retirement_invite_photos").select("position").eq("invite_id", id).order("position", { ascending: false }).limit(1);
  const position = ((last ?? [])[0]?.position ?? 0) + 1;
  const { data, error } = await supabase
    .from("retirement_invite_photos")
    .insert({ invite_id: id, owner_id: user.id, position, caption: text.data, jpeg })
    .select("id,position,caption,updated_at")
    .single();
  if (error) {
    if (/12 photos/.test(error.message)) return NextResponse.json({ error: `An invitation can have up to ${MAX_PHOTOS} photos.` }, { status: 409 });
    return NextResponse.json({ error: isMissingSchema(error) ? PHASE_C_NOT_READY : error.message }, { status: isMissingSchema(error) ? 503 : 500 });
  }
  return NextResponse.json({ photo: present(data) });
}

// Puts the photos in a new order: { order: [photo ids, first to last] }.
export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;
  const auth = await ownedInvite(id);
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const body = (await req.json().catch(() => null)) as { order?: unknown } | null;
  const order = Array.isArray(body?.order) ? body.order.map(String).filter((value) => UUID_RE.test(value)).slice(0, MAX_PHOTOS) : [];
  if (order.length === 0) return NextResponse.json({ error: "Nothing to reorder." }, { status: 400 });
  for (let index = 0; index < order.length; index += 1) {
    const { error } = await supabase.from("retirement_invite_photos").update({ position: index + 1 }).eq("id", order[index]).eq("invite_id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const { data } = await supabase.from("retirement_invite_photos").select("id,position,caption,updated_at").eq("invite_id", id).order("position");
  return NextResponse.json({ photos: (data ?? []).map(present) });
}
