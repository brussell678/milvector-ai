import { appleConfig, buildApplePass } from "@/lib/cards/apple-pass";
import { loadCardForViewer, loadCardPhoto } from "@/lib/cards/store";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const config = appleConfig();
  if (!config) return new Response("Apple Wallet is not set up for this site yet.", { status: 503 });

  const supabase = await supabaseServer();
  const loaded = await loadCardForViewer(supabase, slug);
  if (!loaded || loaded.state !== "live") return new Response("Not found", { status: 404 });

  try {
    const photo = loaded.hasPhoto ? await loadCardPhoto(supabase, loaded.slug, "png") : null;
    const pass = buildApplePass({ card: loaded.card, slug: loaded.slug, cardId: loaded.id, photoPngBase64: photo, config });
    await supabase.rpc("record_card_event", { p_slug: loaded.slug, p_kind: "apple", p_source: "direct" });
    return new Response(new Uint8Array(pass), {
      headers: {
        "Content-Type": "application/vnd.apple.pkpass",
        "Content-Disposition": `attachment; filename="${loaded.slug}.pkpass"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("apple pass build failed", error);
    return new Response("The Apple Wallet pass could not be built. The signing certificate may be invalid or expired.", { status: 500 });
  }
}
