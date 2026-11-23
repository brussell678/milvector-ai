import { Suspense } from "react";
import { MosChat } from "@/components/chat/mos-chat";
import { MosTranslatorClassic } from "@/components/tools/mos-translator-classic";
import { chatEnabled } from "@/lib/chat/access";
import { CHAT_TOOLS } from "@/lib/chat/tools";
import { supabaseServer } from "@/lib/supabase/server";

// The MOS Translator. Whoever the chat is open to (the admin first, then
// CHAT_TOOLS_PUBLIC) gets the chat view; everyone else gets today's page, which
// stays at ?view=classic (docs/CHAT_TOOLS_PLAN.md, 1.1). ?mos= and ?welcome=1,
// set by the welcome flow and the new-member home, fill in the MOS either way.
export default async function MosTranslatorPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const chat = !!user && chatEnabled(CHAT_TOOLS.mos_translator.key, user.email);

  if (chat && user && one(params.view) !== "classic") {
    return <MosChat userId={user.id} initialMos={one(params.mos).slice(0, 40)} welcome={one(params.welcome) === "1"} />;
  }
  return (
    <Suspense fallback={<div className="page-shell" />}>
      <MosTranslatorClassic chatAvailable={chat} />
    </Suspense>
  );
}
