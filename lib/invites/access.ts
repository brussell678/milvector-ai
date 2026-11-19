import { isAdminEmail } from "@/lib/auth";
import { siteUrl } from "@/lib/seo";

// The Retirement Invitation Builder creates public pages on this domain, so it
// runs as an admin-only preview until it has been walked end to end.
// Set RETIREMENT_INVITE_PUBLIC=true to open it to every signed-in member.
export function inviteBuilderEnabled(email?: string | null) {
  return process.env.RETIREMENT_INVITE_PUBLIC === "true" || isAdminEmail(email);
}

// A member has one retirement, so one invitation.
export const MAX_INVITES_PER_USER = 1;

export const INVITE_PATH = "/r";

export function inviteUrl(slug: string): string {
  return `${siteUrl}${INVITE_PATH}/${slug}`;
}

export const INVITE_MIGRATION_MESSAGE =
  "Invitation storage is not set up yet. Run migration 0031_retirement_invites.sql in the Supabase SQL editor.";
