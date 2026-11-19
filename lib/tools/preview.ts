import { cardBuilderEnabled } from "@/lib/cards/access";
import { inviteBuilderEnabled } from "@/lib/invites/access";
import { resumeStudioEnabled } from "@/lib/resume/studio-access";

// Preview tools are hidden from the Tools hub until they are opened to
// everyone. Each one has its own switch, so they can be released separately.
const PREVIEW_GATES: Record<string, (email?: string | null) => boolean> = {
  "/app/tools/resume-studio": resumeStudioEnabled,
  "/app/tools/business-card": cardBuilderEnabled,
  "/app/tools/retirement-invitation": inviteBuilderEnabled,
};

export function previewEnabled(href: string, email?: string | null): boolean {
  // A preview tool with no gate stays hidden: safer than showing it by accident.
  return PREVIEW_GATES[href]?.(email) ?? false;
}
