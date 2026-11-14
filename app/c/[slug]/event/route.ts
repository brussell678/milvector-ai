import { NextResponse } from "next/server";
import { EVENT_KINDS, readSource, type EventKind } from "@/lib/cards/schema";
import { supabaseServer } from "@/lib/supabase/server";

// Counts a visit, a contact save, or a link tap. Counts only: no IP address,
// no device details, nothing about the visitor is stored.
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const body = (await req.json().catch(() => null)) as { kind?: string; source?: string } | null;
  const kind = body?.kind;
  // Wallet adds are counted by the pass routes themselves.
  if (!kind || !(EVENT_KINDS as readonly string[]).includes(kind) || kind === "apple" || kind === "google") {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const supabase = await supabaseServer();
  // The owner looking at their own card is not a visit.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { data: own } = await supabase.from("business_cards").select("id").eq("slug", slug.toLowerCase()).eq("user_id", user.id).maybeSingle();
    if (own) return NextResponse.json({ ok: true, counted: false });
  }

  await supabase.rpc("record_card_event", { p_slug: slug, p_kind: kind as EventKind, p_source: readSource(body?.source) });
  return NextResponse.json({ ok: true, counted: true });
}
