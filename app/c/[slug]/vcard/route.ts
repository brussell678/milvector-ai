import { cardUrl } from "@/lib/cards/access";
import { loadCardForViewer, loadCardPhoto } from "@/lib/cards/store";
import { buildVCard, vcardFilename } from "@/lib/cards/vcard";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await supabaseServer();
  const loaded = await loadCardForViewer(supabase, slug);
  if (!loaded) return new Response("Not found", { status: 404 });

  const photo = loaded.hasPhoto ? await loadCardPhoto(supabase, loaded.slug, "jpeg") : null;
  const body = buildVCard(loaded.card, cardUrl(loaded.slug), photo);
  return new Response(body, {
    headers: {
      "Content-Type": "text/vcard; charset=utf-8",
      "Content-Disposition": `attachment; filename="${vcardFilename(loaded.card.name)}"`,
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
