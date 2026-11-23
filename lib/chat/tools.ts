// The tools that have a chat view (docs/CHAT_TOOLS_PLAN.md). Shared by the
// pages, the follow-up endpoint, and the transcript route.

export type ChatToolId = "mos_translator" | "jd_decoder" | "resume_targeter" | "va_rating_navigator" | "sbp_advisor";

export type ChatToolInfo = {
  // The short name the admin portal's switch uses to open the chat to
  // members (chat_tool_access, migration 0044).
  key: string;
  label: string;
  // tool_runs.tool_name for its runs and its follow-ups.
  toolName: string;
  href: string;
};

export const CHAT_TOOLS: Record<ChatToolId, ChatToolInfo> = {
  mos_translator: { key: "mos", label: "MOS Translator", toolName: "mos_translator", href: "/app/tools/mos-translator" },
  jd_decoder: { key: "jd", label: "Job Description Decoder", toolName: "jd_decoder", href: "/app/tools/jd-decoder" },
  resume_targeter: { key: "resume", label: "Targeted Resume Builder", toolName: "resume_targeter", href: "/app/tools/resume-targeter" },
  va_rating_navigator: { key: "va", label: "VA Rating Navigator", toolName: "va_rating_navigator", href: "/app/tools/va-rating-navigator" },
  sbp_advisor: { key: "sbp", label: "SBP Decision Advisor", toolName: "sbp_advisor", href: "/app/tools/sbp-advisor" },
};

export function chatToolFor(id: string): ChatToolInfo | null {
  return Object.hasOwn(CHAT_TOOLS, id) ? CHAT_TOOLS[id as ChatToolId] : null;
}

// How much of a conversation goes to the model with each follow-up.
export const CHAT_TURNS_SENT = 10;
export const CHAT_TURN_CHARS = 2000;
export const CHAT_MESSAGE_CHARS = 2000;
