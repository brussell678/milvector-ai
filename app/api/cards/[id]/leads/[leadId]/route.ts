import { NextResponse } from "next/server";
import { cardBuilderEnabled } from "@/lib/cards/access";
import { LeadUpdateSchema } from "@/lib/cards/schema";
import { supabaseServer } from "@/lib/supabase/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Params = { params: Promise<{ id: string; leadId: string }> };

// The owner's private note on a contact, or a corrected event tag.
export async function PATCH(req: Request, { params }: Params) {
  const { id, leadId } = await params;
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  if (!cardBuilderEnabled(user.email) || !UUID_RE.test(id) || !UUID_RE.test(leadId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = LeadUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the note and try again." }, { status: 400 });

  const update: Record<string, string | null> = {};
  if (parsed.data.ownerNote !== undefined) update.owner_note = parsed.data.ownerNote || null;
  if (parsed.data.eventName !== undefined) update.event_name = parsed.data.eventName || null;

  const { data, error } = await supabase
    .from("business_card_leads")
    .update(update)
    .eq("id", leadId)
    .eq("card_id", id)
    .eq("owner_id", user.id)
    .select("id,owner_note,event_name")
    .maybeSingle();
  if (error && /owner_note|event_name/.test(error.message)) {
    return NextResponse.json({ error: "Notes are not set up yet. Run migration 0041_business_card_upgrades.sql in the Supabase SQL editor." }, { status: 503 });
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "That contact was not found." }, { status: 404 });
  return NextResponse.json({ lead: data });
}
