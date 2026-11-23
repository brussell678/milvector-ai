// The tools that have a chat view (docs/CHAT_TOOLS_PLAN.md). Shared by the
// pages, the follow-up endpoint, and the transcript route.

export type ChatToolId = "mos_translator" | "jd_decoder";

export type ChatToolInfo = {
  // The short name CHAT_TOOLS_PUBLIC uses to open the chat to members.
  key: string;
  label: string;
  // tool_runs.tool_name for its runs and its follow-ups.
  toolName: string;
  href: string;
};

export const CHAT_TOOLS: Record<ChatToolId, ChatToolInfo> = {
  mos_translator: { key: "mos", label: "MOS Translator", toolName: "mos_translator", href: "/app/tools/mos-translator" },
  jd_decoder: { key: "jd", label: "Job Description Decoder", toolName: "jd_decoder", href: "/app/tools/jd-decoder" },
};

export function chatToolFor(id: string): ChatToolInfo | null {
  return Object.hasOwn(CHAT_TOOLS, id) ? CHAT_TOOLS[id as ChatToolId] : null;
}

// How much of a conversation goes to the model with each follow-up.
export const CHAT_TURNS_SENT = 10;
export const CHAT_TURN_CHARS = 2000;
export const CHAT_MESSAGE_CHARS = 2000;
