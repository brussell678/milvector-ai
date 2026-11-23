import { SbpChat } from "@/components/chat/sbp-chat";
import { SbpAdvisorClassic } from "@/components/tools/sbp-advisor-classic";
import { chatEnabled } from "@/lib/chat/access";
import { CHAT_TOOLS } from "@/lib/chat/tools";
import { supabaseServer } from "@/lib/supabase/server";

// The SBP Decision Advisor. Whoever the chat is open to (the admin first, then
// members once the admin portal opens it) gets the chat view; everyone else gets today's
// page, which stays at ?view=classic (docs/CHAT_TOOLS_PLAN.md, Phase 5).
export default async function SbpAdvisorPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const view = Array.isArray(params.view) ? params.view[0] : params.view;
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const chat = !!user && (await chatEnabled(CHAT_TOOLS.sbp_advisor.key, user.email));

  if (chat && user && view !== "classic") return <SbpChat userId={user.id} />;
  return <SbpAdvisorClassic chatAvailable={chat} />;
}
