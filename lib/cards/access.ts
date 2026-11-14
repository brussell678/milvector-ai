import { isAdminEmail } from "@/lib/auth";
import { siteUrl } from "@/lib/seo";
import type { EventSource } from "@/lib/cards/schema";

// The Digital Business Card builder creates public pages on this domain, so it
// runs as an admin-only preview until it has been walked end to end.
// Set CARD_BUILDER_PUBLIC=true to open it to every signed-in member.
export function cardBuilderEnabled(email?: string | null) {
  return process.env.CARD_BUILDER_PUBLIC === "true" || isAdminEmail(email);
}

// The public address of a card. The source tag lets the owner see whether a
// visit came from the QR code, a wallet pass, an NFC tap, or a plain link.
export function cardUrl(slug: string, source?: EventSource): string {
  const base = `${siteUrl}/c/${slug}`;
  return source && source !== "direct" ? `${base}?s=${source}` : base;
}
