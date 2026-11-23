import { isAdminEmail } from "@/lib/auth";
import { siteUrl } from "@/lib/seo";
import type { EventSource } from "@/lib/cards/schema";

// The Digital Business Card builder is open to every signed-in member
// (launched 2026-11-20). It creates public pages on this domain, so it keeps
// an off switch: set CARD_BUILDER_PUBLIC=false and redeploy to close it to
// everyone but the admin.
export function cardBuilderEnabled(email?: string | null) {
  return process.env.CARD_BUILDER_PUBLIC !== "false" || isAdminEmail(email);
}

// The public address of a card. The source tag lets the owner see whether a
// visit came from the QR code, a wallet pass, an NFC tap, or a plain link.
export function cardUrl(slug: string, source?: EventSource): string {
  const base = `${siteUrl}/c/${slug}`;
  return source && source !== "direct" ? `${base}?s=${source}` : base;
}

/** The card's address as people read and type it: milvector.org/c/<slug>. */
export function shortCardUrl(slug: string): string {
  return `${siteUrl.replace(/^https?:\/\//, "").replace(/^www\./, "")}/c/${slug}`;
}
