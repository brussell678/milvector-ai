import { walletHeroJpeg } from "@/lib/cards/banner";
import { loadCardBanner } from "@/lib/cards/store";
import { supabaseServer } from "@/lib/supabase/server";

// The card's banner. ?v=wallet returns the 3:1 crop Google Wallet shows on the
// pass. Any other query (the editor adds ?t=<version>) only busts caches.
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await supabaseServer();
  const banner = await loadCardBanner(supabase, slug);
  if (!banner) return new Response("Not found", { status: 404 });
  const wallet = new URL(req.url).searchParams.get("v") === "wallet";
  const bytes = wallet ? await walletHeroJpeg(banner) : Buffer.from(banner, "base64");
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "image/jpeg",
      // Short cache so a new banner shows up within minutes.
      "Cache-Control": "public, max-age=300",
      "X-Robots-Tag": "noindex",
    },
  });
}
