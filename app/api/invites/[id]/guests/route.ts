import { NextResponse } from "next/server";
import { isMissingSchema } from "@/lib/cards/store";
import { PHASE_C_NOT_READY as NOT_READY, ownedInvite } from "@/lib/invites/owner";
import { GUEST_COLUMNS, HostGuestSchema, attendingBaseEvent } from "@/lib/invites/rsvp";
import { readInviteData } from "@/lib/invites/schema";

type Params = { params: Promise<{ id: string }> };

// Everyone who has answered, and the messages left on the day. Old answers
// past the retention date are deleted first, so the host never sees data
// that should be gone.
export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const auth = await ownedInvite(id);
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  await supabase.rpc("purge_expired_invite_guests");
  const guestsWith = (columns: string) =>
    supabase.from("retirement_invite_guests").select(columns).eq("invite_id", id).order("updated_at", { ascending: false }).limit(500);
  const [first, { data: messages }] = await Promise.all([
    guestsWith(GUEST_COLUMNS),
    supabase.from("retirement_invite_messages").select("id,name,message,created_at").eq("invite_id", id).order("created_at", { ascending: false }).limit(500),
  ]);
  // Before migration 0034 the reminder column does not exist. The list still
  // loads without it; only reminders and day messages wait for the update.
  const { data, error } = first.error && isMissingSchema(first.error) ? await guestsWith(GUEST_COLUMNS.replace(",last_reminded_at", "")) : first;
  if (error) {
    return NextResponse.json({ error: isMissingSchema(error) ? NOT_READY : error.message }, { status: isMissingSchema(error) ? 503 : 500 });
  }
  return NextResponse.json({ guests: data ?? [], messages: messages ?? [] }, { headers: { "Cache-Control": "no-store" } });
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
      pass_people: dodId === "no" ? guest.passPeople : [],
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
