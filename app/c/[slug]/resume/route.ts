import { loadCardResume } from "@/lib/cards/store";
import { supabaseServer } from "@/lib/supabase/server";

// The resume a member attached to their card. Downloads are counted by the
// card page itself, the same way contact saves are.
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await supabaseServer();
  const resume = await loadCardResume(supabase, slug);
  if (!resume) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(Buffer.from(resume.data, "base64")), {
    headers: {
      "Content-Type": resume.mime,
      "Content-Disposition": `attachment; filename="${resume.name.replace(/[^A-Za-z0-9._-]/g, "")}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex",
    },
  });
}
