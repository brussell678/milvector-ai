import { isAdminEmail } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { CHAT_TOOLS } from "@/lib/chat/tools";

// Who sees each chat view (D6, Phase 6). The admin always does. Members do
// once the admin opens that tool's chat on the admin portal, which writes the
// chat_tool_access table (migration 0044); the next page load shows it, with
// no redeploy. Until then members keep today's page.

export type ChatSwitch = { key: string; label: string; open: boolean; updatedAt: string | null };

/** Whether this person sees the chat, given the tools open to members. */
export function chatOpenFor(key: string, email: string | null | undefined, openKeys: readonly string[]): boolean {
  return isAdminEmail(email) || openKeys.includes(key);
}

/**
 * The tools whose chat is open to every member. Fails closed: if the switches
 * cannot be read (0044 not run yet, or the database is down), members keep
 * the classic pages, which do everything the chats do.
 */
export async function openChatKeys(): Promise<string[]> {
  try {
    const supabase = await supabaseServer();
    const { data, error } = await supabase.from("chat_tool_access").select("tool_key").eq("open_to_members", true);
    if (error) return [];
    return (data ?? []).map((row) => String((row as { tool_key: unknown }).tool_key));
  } catch {
    return [];
  }
}

/** Whether this person sees the chat view of the tool with this short name. */
export async function chatEnabled(key: string, email?: string | null): Promise<boolean> {
  if (isAdminEmail(email)) return true;
  return chatOpenFor(key, email, await openChatKeys());
}

/** Every chat tool's switch, in the order the tools list them, for the admin portal; null when 0044 has not run. */
export async function chatSwitches(): Promise<ChatSwitch[] | null> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.from("chat_tool_access").select("tool_key,open_to_members,updated_at");
  if (error) return null;
  const rows = new Map(((data ?? []) as Array<{ tool_key: string; open_to_members: boolean; updated_at: string | null }>).map((row) => [row.tool_key, row]));
  return Object.values(CHAT_TOOLS).map((tool) => {
    const row = rows.get(tool.key);
    return { key: tool.key, label: tool.label, open: !!row?.open_to_members, updatedAt: row?.updated_at ?? null };
  });
}
