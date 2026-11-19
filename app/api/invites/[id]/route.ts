import { NextResponse } from "next/server";
import { inviteBuilderEnabled } from "@/lib/invites/access";
import { piiProblem } from "@/lib/invites/opsec";
import { InviteDataSchema, inviteSlugProblem, splitPrivate, validCover } from "@/lib/invites/schema";
import { OWNER_COLUMNS, presentInvite, type OwnerRow } from "@/lib/invites/store";
import { supabaseServer } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string }> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function signedIn(id: string) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Sign in to continue." }, { status: 401 }) } as const;
  if (!inviteBuilderEnabled(user.email) || !UUID_RE.test(id)) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) } as const;
  return { supabase, user } as const;
}

// Saves the invitation, its address, its cover photo, or whether it is live.
export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;
  const auth = await signedIn(id);
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  const body = (await req.json().catch(() => null)) as { invite?: unknown; slug?: unknown; published?: unknown; cover?: unknown } | null;
  if (!body) return NextResponse.json({ error: "Nothing to save." }, { status: 400 });

  const update: Record<string, unknown> = {};
  let ceremonyDate: string | null = null;

  if (body.invite !== undefined) {
    const parsed = InviteDataSchema.safeParse(body.invite);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return NextResponse.json({ error: issue?.message ?? "Check the details and try again.", field: issue?.path.join(".") }, { status: 400 });
    }
    const pii = piiProblem(parsed.data);
    if (pii) return NextResponse.json({ error: pii }, { status: 400 });
    const { publicData, privateData } = splitPrivate(parsed.data);
    update.data = publicData;
    update.private_data = privateData;
    ceremonyDate = parsed.data.events[0]?.date ?? null;
  }

  if (body.slug !== undefined) {
    const slug = String(body.slug).trim().toLowerCase();
    const problem = inviteSlugProblem(slug);
    if (problem) return NextResponse.json({ error: problem, field: "slug" }, { status: 400 });
    update.slug = slug;
  }

  if (body.published !== undefined) update.published = body.published === true;

  if (body.cover === null) {
    update.cover_jpeg = null;
  } else if (body.cover !== undefined) {
    const cover = String(body.cover);
    if (!validCover(cover)) return NextResponse.json({ error: "That photo could not be used. Try a different image." }, { status: 400 });
    update.cover_jpeg = cover;
  }

  if (Object.keys(update).length === 0) return NextResponse.json({ error: "Nothing to save." }, { status: 400 });

  const { data, error } = await supabase.from("retirement_invites").update(update).eq("id", id).eq("user_id", user.id).select(OWNER_COLUMNS).maybeSingle<OwnerRow>();
  if (error?.code === "23505") return NextResponse.json({ error: "That address is already taken. Pick another.", field: "slug" }, { status: 409 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // The ceremony date also lives on the profile, where the Timeline counts down
  // to it. Keep the two in step. Best effort: a profile that does not exist yet
  // is left alone, and a failure here never fails the save.
  let profileUpdated = false;
  if (ceremonyDate) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("retirement_ceremony_date")
      .eq("id", user.id)
      .maybeSingle<{ retirement_ceremony_date: string | null }>();
    if (profile && profile.retirement_ceremony_date !== ceremonyDate) {
      const { error: profileError } = await supabase.from("profiles").update({ retirement_ceremony_date: ceremonyDate }).eq("id", user.id);
      profileUpdated = !profileError;
    }
  }

  return NextResponse.json({ invite: presentInvite(data), profileUpdated });
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  const auth = await signedIn(id);
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  const { error } = await supabase.from("retirement_invites").delete().eq("id", id).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
