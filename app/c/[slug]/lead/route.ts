import { NextResponse } from "next/server";
import { LeadSchema, readCardData, readSource } from "@/lib/cards/schema";
import { notifyCardOwnerNewLead } from "@/lib/email";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";

// A visitor shares their contact details with the card owner.
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Please fill in the form and try again." }, { status: 400 });

  // Honeypot: a real visitor never sees or fills this field. Answer as if it
  // worked so a bot learns nothing.
  if (typeof body.website === "string" && body.website.trim() !== "") return NextResponse.json({ ok: true });

  const parsed = LeadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Please check the form and try again." }, { status: 400 });
  }
  const lead = parsed.data;

  const supabase = await supabaseServer();
  const { data: leadId, error } = await supabase.rpc("submit_card_lead", {
    p_slug: slug,
    p_name: lead.name,
    p_email: lead.email,
    p_phone: lead.phone,
    p_company: lead.company,
    p_note: lead.note,
    p_source: readSource(typeof body.source === "string" ? body.source : null),
  });
  if (error) return NextResponse.json({ error: "That did not go through. Please try again in a moment." }, { status: 500 });
  if (!leadId) return NextResponse.json({ error: "This card is not accepting contact details right now." }, { status: 409 });

  // Best effort email to the owner. Needs the service role key to look up
  // their address; without it the contact still lands in their Contacts tab.
  try {
    const admin = supabaseAdmin();
    if (admin) {
      const { data: row } = await admin.from("business_cards").select("user_id,data").eq("slug", slug.toLowerCase()).maybeSingle();
      if (row) {
        const card = readCardData(row.data);
        if (card.notifyLeads) {
          const { data: owner } = await admin.auth.admin.getUserById(row.user_id);
          if (owner.user?.email) await notifyCardOwnerNewLead({ to: owner.user.email, cardName: card.name, lead });
        }
      }
    }
  } catch (notifyError) {
    console.error("card lead email failed", notifyError);
  }

  return NextResponse.json({ ok: true });
}
