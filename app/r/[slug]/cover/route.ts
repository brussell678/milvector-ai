import { loadInviteCover } from "@/lib/invites/store";
import { supabaseServer } from "@/lib/supabase/server";

// The invitation's cover photo, for a page the viewer is allowed to see.
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await supabaseServer();
  const cover = await loadInviteCover(supabase, slug);
  if (!cover) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(cover, "base64"), {
    headers: {
      "Content-Type": "image/jpeg",
      // The page links it with a version tag, so a changed photo is a new
      // address. Private: a draft's photo must never sit in a shared cache.
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
