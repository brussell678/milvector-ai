import { SbpChat } from "@/components/chat/sbp-chat";
import { DecisionGate } from "@/components/tools/decision-notice";
import { SbpAdvisorClassic } from "@/components/tools/sbp-advisor-classic";
import { chatEnabled } from "@/lib/chat/access";
import { CHAT_TOOLS } from "@/lib/chat/tools";
import { ackStatus } from "@/lib/legal/acknowledgments";
import { supabaseServer } from "@/lib/supabase/server";

// The SBP Decision Advisor. Whoever the chat is open to (the admin first, then
// members once the admin portal opens it) gets the chat view; everyone else gets today's
// page, which stays at ?view=classic (docs/CHAT_TOOLS_PLAN.md, Phase 5). Either
// way a member confirms the Decide notice once first (lib/legal/decision-notice.ts).
export default async function SbpAdvisorPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const view = Array.isArray(params.view) ? params.view[0] : params.view;
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const chat = !!user && (await chatEnabled(CHAT_TOOLS.sbp_advisor.key, user.email));

  const required = !!user && (await ackStatus(supabase, user.id, "sbp")) === "needed";
  return (
    <DecisionGate tool="sbp" kicker="SBP DECISION ADVISOR" title="The Survivor Benefit Plan, with your real numbers" required={required}>
      {chat && user && view !== "classic" ? <SbpChat userId={user.id} /> : <SbpAdvisorClassic chatAvailable={chat} />}
    </DecisionGate>
  );
}
