import { isAdminEmail } from "@/lib/auth";

// Each chat view opens to the admin first (D6). CHAT_TOOLS_PUBLIC lists the
// tools whose chat is open to every member, by short name: "mos" now, more as
// each phase ships. Until a tool is listed, members keep today's page.
export function chatEnabled(key: string, email?: string | null): boolean {
  if (isAdminEmail(email)) return true;
  return (process.env.CHAT_TOOLS_PUBLIC ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .includes(key);
}
