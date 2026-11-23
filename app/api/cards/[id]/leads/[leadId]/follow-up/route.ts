import { NextResponse } from "next/server";
import { cardBuilderEnabled } from "@/lib/cards/access";
import { cleanFollowUp, promptFollowUp, type FollowUpLead } from "@/lib/cards/follow-up";
import { readCardData } from "@/lib/cards/schema";
import { getEnv } from "@/lib/env";
import { supabaseServer } from "@/lib/supabase/server";
import { runLoggedJson } from "@/lib/tools/run";
import { enforceAiUsageLimit } from "@/lib/usage-limit";

export const maxDuration = 120;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Params = { params: Promise<{ id: string; leadId: string }> };

// Drafts a follow-up email to one contact from the member's card. Nothing is
// sent: the member edits it and sends it from their own email.
export async function POST(_req: Request, { params }: Params) {
  const { id, leadId } = await params;
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  if (!cardBuilderEnabled(user.email) || !UUID_RE.test(id) || !UUID_RE.test(leadId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: card } = await supabase.from("business_cards").select("data").eq("id", id).eq("user_id", user.id).maybeSingle<{ data: unknown }>();
  if (!card) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data, error } = await supabase
    .from("business_card_leads")
    .select("name,company,note,created_at,owner_note,event_name")
    .eq("id", leadId)
    .eq("card_id", id)
    .eq("owner_id", user.id)
    .maybeSingle();
  // Migration 0041 adds these columns and lets tool_runs log this tool. Before
  // it, a draft could not be counted toward the daily AI limit, so none is made.
  if (error) {
    return NextResponse.json({ error: "Follow-up drafts are not set up yet. Run migration 0041_business_card_upgrades.sql in the Supabase SQL editor." }, { status: 503 });
  }
  const lead = data as FollowUpLead | null;
  if (!lead) return NextResponse.json({ error: "That contact was not found." }, { status: 404 });

  const overLimit = await enforceAiUsageLimit({ supabase, userId: user.id, email: user.email });
  if (overLimit) return overLimit;

  const run = await runLoggedJson<Record<string, unknown>>({
    supabase,
    userId: user.id,
    toolName: "card_follow_up",
    // Metadata only: no names or notes in the log.
    inputJson: { hasNote: !!lead.note, hasOwnerNote: !!lead.owner_note, hasEvent: !!lead.event_name },
    prompt: promptFollowUp(readCardData(card.data), lead),
    model: getEnv().TOOLS_MODEL,
    timeoutMs: 60_000,
    temperature: 0.5,
    storeOutput: () => null,
  });
  if (!run.ok) return NextResponse.json({ error: "The draft could not be written. Try again in a moment." }, { status: 502 });

  const draft = cleanFollowUp(run.data);
  if (!draft) return NextResponse.json({ error: "The draft came back empty. Try again." }, { status: 502 });
  return NextResponse.json({ draft });
}
