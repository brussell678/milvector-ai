import { inviteUrl } from "@/lib/invites/access";
import { loadInviteForViewer } from "@/lib/invites/store";
import { buildIcs, eventIsComplete } from "@/lib/invites/time";
import { supabaseServer } from "@/lib/supabase/server";

// A calendar file for one event. Built from the public page data, so it never
// carries a private street address.
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string; event: string }> }) {
  const { slug, event: eventId } = await params;
  const supabase = await supabaseServer();
  const loaded = await loadInviteForViewer(supabase, slug);
  const event = loaded?.data.events.find((item) => item.id === eventId);
  if (!loaded || !event || !eventIsComplete(event)) return new Response("Not found", { status: 404 });

  const ics = buildIcs({ data: loaded.data, event, slug: loaded.slug, pageUrl: inviteUrl(loaded.slug) });
  const filename = `${loaded.slug}-${event.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "event"}.ics`;
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, max-age=60",
    },
  });
}
