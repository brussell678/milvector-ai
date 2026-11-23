import { cardUrl } from "@/lib/cards/access";
import { loadCardForViewer, loadCardPhoto } from "@/lib/cards/store";
import { buildVCard, savedOnLabel, vcardFilename } from "@/lib/cards/vcard";
import { supabaseServer } from "@/lib/supabase/server";

// ?saved=YYYY-MM-DD is the visitor's own date, added by the Save Contact
// button, so the saved contact's note says which day they met.
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await supabaseServer();
  const loaded = await loadCardForViewer(supabase, slug);
  if (!loaded) return new Response("Not found", { status: 404 });

  const photo = loaded.hasPhoto ? await loadCardPhoto(supabase, loaded.slug, "jpeg") : null;
  const savedOn = savedOnLabel(new URL(req.url).searchParams.get("saved"));
  // Tagged so a later visit from the saved contact counts as "Saved contact".
  const body = buildVCard(loaded.card, cardUrl(loaded.slug, "contact"), photo, savedOn);
  return new Response(body, {
    headers: {
      "Content-Type": "text/vcard; charset=utf-8",
      "Content-Disposition": `attachment; filename="${vcardFilename(loaded.card.name)}"`,
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
