import { createHmac } from "node:crypto";
import { isMissingSchema } from "@/lib/cards/store";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";

// Guests write through the site, never straight to the database: after
// migration 0036 the database answers only the server key, and counts each
// sender so one person with the link cannot flood an invitation.
//
// The sender is a keyed scramble of the guest's internet address, the
// invitation, and the date. It cannot be turned back into the address, does
// not link one day to the next, and the database deletes it after two days.

function clientAddress(req: Request): string {
  // Vercel overwrites these with the visitor's address so a client cannot
  // spoof them; x-vercel-forwarded-for is the one its docs say survives a
  // proxy in front. Locally none is set and every request is one sender.
  const first = (name: string) => req.headers.get(name)?.split(",")[0]?.trim();
  return first("x-vercel-forwarded-for") || first("x-forwarded-for") || first("x-real-ip") || "unknown";
}

export function senderOf(req: Request, slug: string, secret: string, now: Date = new Date()): string {
  return createHmac("sha256", secret).update(`${clientAddress(req)}|${slug.toLowerCase()}|${now.toISOString().slice(0, 10)}`).digest("hex");
}

type RpcResult = { data: unknown; error: { code?: string; message?: string } | null };

/**
 * Calls the site-only version of a guest write with the server key. Before
 * migration 0036 is run that version does not exist, so the original function
 * is called the old way; once 0036 has run, the old way is closed.
 */
export async function submitFromSite(req: Request, slug: string, kind: "rsvp" | "message", args: Record<string, unknown>): Promise<RpcResult> {
  const siteFunction = kind === "rsvp" ? "submit_invite_rsvp_from_site" : "submit_invite_message_from_site";
  const original = kind === "rsvp" ? "submit_invite_rsvp" : "submit_invite_message";
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const admin = supabaseAdmin();
  if (admin && secret) {
    const result = await admin.rpc(siteFunction, { p_sender: senderOf(req, slug, secret), ...args });
    if (!result.error || !isMissingSchema(result.error)) return result;
  }
  const supabase = await supabaseServer();
  const result = await supabase.rpc(original, args);
  if (result.error?.code === "42501") {
    // The original is closed (0036 has run) but this server has no key.
    console.error(`[invites] ${kind} refused: set SUPABASE_SERVICE_ROLE_KEY so the site can reach ${siteFunction}.`);
  }
  return result;
}
