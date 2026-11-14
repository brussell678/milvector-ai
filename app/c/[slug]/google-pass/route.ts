import { NextResponse } from "next/server";
import { googleConfig, googleSaveUrl } from "@/lib/cards/google-pass";
import { loadCardForViewer } from "@/lib/cards/store";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const config = googleConfig();
  if (!config) return new Response("Google Wallet is not set up for this site yet.", { status: 503 });

  const supabase = await supabaseServer();
  const loaded = await loadCardForViewer(supabase, slug);
  if (!loaded || loaded.state !== "live") return new Response("Not found", { status: 404 });

  try {
    const { url } = await googleSaveUrl({ card: loaded.card, slug: loaded.slug, cardId: loaded.id, hasPhoto: loaded.hasPhoto, config });
    await supabase.rpc("record_card_event", { p_slug: loaded.slug, p_kind: "google", p_source: "direct" });
    return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("google pass build failed", error);
    return new Response("The Google Wallet pass could not be built. The service account key may be invalid.", { status: 500 });
  }
}
