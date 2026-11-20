import { loadInvitePhoto } from "@/lib/invites/store";
import { supabaseServer } from "@/lib/supabase/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// One career photo, for a page the viewer is allowed to see.
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string; photo: string }> }) {
  const { slug, photo } = await params;
  if (!UUID_RE.test(photo)) return new Response("Not found", { status: 404 });
  const supabase = await supabaseServer();
  const jpeg = await loadInvitePhoto(supabase, slug, photo);
  if (!jpeg) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(jpeg, "base64"), {
    headers: {
      "Content-Type": "image/jpeg",
      // Linked with a version tag; private so a draft never sits in a shared cache.
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
