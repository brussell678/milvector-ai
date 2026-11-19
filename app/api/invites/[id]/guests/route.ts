import { NextResponse } from "next/server";
import { isMissingSchema } from "@/lib/cards/store";
import { inviteBuilderEnabled } from "@/lib/invites/access";
import { GUEST_COLUMNS, HostGuestSchema, attendingBaseEvent } from "@/lib/invites/rsvp";
import { readInviteData } from "@/lib/invites/schema";
import { supabaseServer } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string }> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOT_READY = "Guest answers are not set up yet. Run migration 0032_retirement_invite_guests.sql in the Supabase SQL editor.";

async function ownedInvite(id: string) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Sign in to continue." }, { status: 401 }) } as const;
  if (!inviteBuilderEnabled(user.email) || !UUID_RE.test(id)) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) } as const;
  const { data: invite } = await supabase.from("retirement_invites").select("id,data").eq("id", id).eq("user_id", user.id).maybeSingle<{ id: string; data: unknown }>();
  if (!invite) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) } as const;
  return { supabase, user, invite } as const;
}

// Everyone who has answered. Old answers past the retention date are
// deleted first, so the host never sees data that should be gone.
export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const auth = await ownedInvite(id);
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  await supabase.rpc("purge_expired_invite_guests");
  const { data, error } = await supabase
    .from("retirement_invite_guests")
    .select(GUEST_COLUMNS)
    .eq("invite_id", id)
    .order("updated_at", { ascending: false })
    .limit(500);
  if (error) {
    return NextResponse.json({ error: isMissingSchema(error) ? NOT_READY : error.message }, { status: isMissingSchema(error) ? 503 : 500 });
  }
  return NextResponse.json({ guests: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
}

// The host adds someone by hand: a relative who will never use the form.
export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const auth = await ownedInvite(id);
  if ("error" in auth) return auth.error;
  const { supabase, user, invite } = auth;

  const parsed = HostGuestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the guest's details." }, { status: 400 });
  const guest = parsed.data;
  const data = readInviteData(invite.data);
  const eventIds = new Set(data.events.map((event) => event.id));
  const answers = Object.fromEntries(Object.entries(guest.answers).filter(([eventId]) => eventIds.has(eventId)));
  if (Object.keys(answers).length === 0) return NextResponse.json({ error: "Answer for at least one event." }, { status: 400 });
  const onBase = attendingBaseEvent(data, answers);
  const dodId = onBase && guest.dodId ? guest.dodId : null;

  const { data: row, error } = await supabase
    .from("retirement_invite_guests")
    .insert({
      invite_id: id,
      owner_id: user.id,
      name: guest.name,
      email: guest.email || null,
      phone: guest.phone || null,
      answers,
      dietary: guest.dietary || null,
      dod_id: dodId,
      pass_names: dodId === "no" ? guest.passNames || null : null,
    })
    .select(GUEST_COLUMNS)
    .single();
  if (error?.code === "23505") return NextResponse.json({ error: "Someone with that email is already on the list." }, { status: 409 });
  if (error) {
    const full = /500 guests/.test(error.message);
    return NextResponse.json({ error: full ? "An invitation can have up to 500 guests." : isMissingSchema(error) ? NOT_READY : error.message }, { status: full ? 409 : 500 });
  }
  return NextResponse.json({ guest: row });
}
