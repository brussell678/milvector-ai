import { loadCardPhoto } from "@/lib/cards/store";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await supabaseServer();
  const photo = await loadCardPhoto(supabase, slug, "jpeg");
  if (!photo) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(Buffer.from(photo, "base64")), {
    headers: {
      "Content-Type": "image/jpeg",
      // Short cache so a new photo shows up within minutes.
      "Cache-Control": "public, max-age=300",
      "X-Robots-Tag": "noindex",
    },
  });
}
