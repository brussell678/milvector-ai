import QRCode from "qrcode";
import { cardUrl } from "@/lib/cards/access";
import { renderPrintPage, type PrintLayout } from "@/lib/cards/print";
import { qrColor } from "@/lib/cards/schema";
import { loadCardBannerVersion, loadCardForViewer } from "@/lib/cards/store";
import { supabaseServer } from "@/lib/supabase/server";

// Printable paper cards for the card's owner: 10 to a US Letter sheet of
// 3.5 x 2 inch business card stock, or a front and back with bleed for a print
// shop. A standalone page (no site header or footer) so it prints exactly.
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await supabaseServer();
  const loaded = await loadCardForViewer(supabase, slug);
  if (!loaded || loaded.viewer === "public") return new Response("Not found", { status: 404 });

  const url = new URL(req.url);
  const layout: PrintLayout = url.searchParams.get("layout") === "shop" ? "shop" : "sheet";
  const guides = url.searchParams.get("guides") === "1";
  const bannerVersion = await loadCardBannerVersion(supabase, loaded.slug);
  const qrSvg = await QRCode.toString(cardUrl(loaded.slug, "print"), {
    type: "svg",
    margin: 0,
    errorCorrectionLevel: "M",
    color: { dark: qrColor(loaded.card.accent), light: "#ffffff" },
  });

  const html = renderPrintPage({
    card: loaded.card,
    slug: loaded.slug,
    layout,
    guides,
    qrSvg,
    photoSrc: loaded.hasPhoto ? `/c/${loaded.slug}/photo` : null,
    bannerSrc: bannerVersion ? `/c/${loaded.slug}/banner?t=${encodeURIComponent(bannerVersion)}` : null,
    shortUrl: cardUrl(loaded.slug).replace(/^https?:\/\/(www\.)?/, ""),
  });
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
}
