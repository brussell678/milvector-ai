import { NextResponse } from "next/server";
import { inviteBuilderEnabled } from "@/lib/invites/access";
import { GUEST_COLUMNS, PipelinePatchSchema } from "@/lib/invites/rsvp";
import { supabaseServer } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string; guestId: string }> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function signedIn(id: string, guestId: string) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Sign in to continue." }, { status: 401 }) } as const;
  if (!inviteBuilderEnabled(user.email) || !UUID_RE.test(id) || !UUID_RE.test(guestId)) {
    return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) } as const;
  }
  return { supabase, user } as const;
}

// Ticks a step of a guest's visitor pass. Row policies limit this to the
// invitation's owner; the filters keep it to this invitation.
export async function PATCH(req: Request, { params }: Params) {
  const { id, guestId } = await params;
  const auth = await signedIn(id, guestId);
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  const parsed = PipelinePatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Nothing to save." }, { status: 400 });

  const { data: current } = await supabase
    .from("retirement_invite_guests")
    .select("pipeline")
    .eq("id", guestId)
    .eq("invite_id", id)
    .eq("owner_id", user.id)
    .maybeSingle<{ pipeline: Record<string, boolean> | null }>();
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data, error } = await supabase
    .from("retirement_invite_guests")
    .update({ pipeline: { ...(current.pipeline ?? {}), ...parsed.data.pipeline } })
    .eq("id", guestId)
    .eq("invite_id", id)
    .eq("owner_id", user.id)
    .select(GUEST_COLUMNS)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ guest: data });
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id, guestId } = await params;
  const auth = await signedIn(id, guestId);
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  const { error } = await supabase.from("retirement_invite_guests").delete().eq("id", guestId).eq("invite_id", id).eq("owner_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
