import { JdChat } from "@/components/chat/jd-chat";
import { JdDecoderClassic } from "@/components/tools/jd-decoder-classic";
import { chatEnabled } from "@/lib/chat/access";
import { CHAT_TOOLS } from "@/lib/chat/tools";
import { supabaseServer } from "@/lib/supabase/server";

// The Job Description Decoder. Whoever the chat is open to (the admin first,
// then CHAT_TOOLS_PUBLIC with "jd") gets the chat view; everyone else gets
// today's page, which stays at ?view=classic (docs/CHAT_TOOLS_PLAN.md, 2.1).
export default async function JdDecoderPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const view = Array.isArray(params.view) ? params.view[0] : params.view;
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const chat = !!user && chatEnabled(CHAT_TOOLS.jd_decoder.key, user.email);

  if (chat && user && view !== "classic") return <JdChat userId={user.id} />;
  return <JdDecoderClassic chatAvailable={chat} />;
}
