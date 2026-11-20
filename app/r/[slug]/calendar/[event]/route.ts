import { inviteUrl } from "@/lib/invites/access";
import { loadInviteForViewer } from "@/lib/invites/store";
import { buildIcs, eventIsComplete } from "@/lib/invites/time";
import { supabaseServer } from "@/lib/supabase/server";

// A calendar file for one event, built from the public page data. With a
// guest's personal link (?rsvp=) it also carries the private street address
// that guest was given for answering, so the address is in their calendar on
// the day. Without one it never does.
export async function GET(req: Request, { params }: { params: Promise<{ slug: string; event: string }> }) {
  const { slug, event: eventId } = await params;
  const supabase = await supabaseServer();
  const loaded = await loadInviteForViewer(supabase, slug);
  const event = loaded?.data.events.find((item) => item.id === eventId);
  if (!loaded || !event || !eventIsComplete(event)) return new Response("Not found", { status: 404 });

  let privateAddress: string | undefined;
  const token = new URL(req.url).searchParams.get("rsvp") ?? "";
  if (event.addressPrivate && /^[a-f0-9]{32,80}$/.test(token)) {
    const { data } = await supabase.rpc("get_invite_rsvp", { p_slug: loaded.slug, p_token: token });
    const address = (data as { addresses?: Record<string, string> } | null)?.addresses?.[event.id];
    if (typeof address === "string" && address.trim()) privateAddress = address.trim();
  }

  const ics = buildIcs({ data: loaded.data, event, slug: loaded.slug, pageUrl: inviteUrl(loaded.slug), privateAddress });
  const filename = `${loaded.slug}-${event.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "event"}.ics`;
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      // A file holding a private address is never cached.
      "Cache-Control": privateAddress ? "private, no-store" : "private, max-age=60",
    },
  });
}
