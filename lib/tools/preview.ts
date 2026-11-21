import { cardBuilderEnabled } from "@/lib/cards/access";
import { inviteBuilderEnabled } from "@/lib/invites/access";

// Tools with their own switch. A preview tool (isPreview in the registry) is
// hidden until its switch opens it; an open tool with a switch here (the card
// and invitation builders) shows unless its switch is turned off. Each one has
// its own switch, so they can be released or closed separately.
const PREVIEW_GATES: Record<string, (email?: string | null) => boolean> = {
  "/app/tools/business-card": cardBuilderEnabled,
  "/app/tools/retirement-invitation": inviteBuilderEnabled,
};

export function previewEnabled(href: string, email?: string | null): boolean {
  // A preview tool with no gate stays hidden: safer than showing it by accident.
  return PREVIEW_GATES[href]?.(email) ?? false;
}

/**
 * Whether a link elsewhere in the workspace (a Timeline task, for one) may
 * point this member at a tool. Links to a preview tool show only to the people
 * the preview is open to; every other link shows. Ignores ?query and #hash, so
 * a deep link to one tab follows the tool's own switch.
 */
export function toolLinkVisible(href: string, email?: string | null): boolean {
  const path = href.split(/[?#]/)[0];
  return Object.hasOwn(PREVIEW_GATES, path) ? previewEnabled(path, email) : true;
}
