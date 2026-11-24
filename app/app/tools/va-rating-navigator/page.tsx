import { VaChat } from "@/components/chat/va-chat";
import { DecisionGate } from "@/components/tools/decision-notice";
import { VaNavigatorClassic } from "@/components/tools/va-navigator-classic";
import { chatEnabled } from "@/lib/chat/access";
import { CHAT_TOOLS } from "@/lib/chat/tools";
import { ackStatus } from "@/lib/legal/acknowledgments";
import { supabaseServer } from "@/lib/supabase/server";

// The VA Rating Navigator. Whoever the chat is open to (the admin first, then
// members once the admin portal opens it) gets the chat view; everyone else gets today's
// page, which stays at ?view=classic (docs/CHAT_TOOLS_PLAN.md, 4.1). Either way
// a member confirms the Decide notice once first (lib/legal/decision-notice.ts).
export default async function VaRatingNavigatorPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const view = Array.isArray(params.view) ? params.view[0] : params.view;
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const chat = !!user && (await chatEnabled(CHAT_TOOLS.va_rating_navigator.key, user.email));

  const required = !!user && (await ackStatus(supabase, user.id, "va")) === "needed";
  return (
    <DecisionGate tool="va" kicker="VA RATING NAVIGATOR" title="How VA would rate each condition you claim" required={required}>
      {chat && user && view !== "classic" ? <VaChat userId={user.id} /> : <VaNavigatorClassic chatAvailable={chat} />}
    </DecisionGate>
  );
}
