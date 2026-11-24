import type { SupabaseClient } from "@supabase/supabase-js";
import { loadRoster } from "@/lib/admin/members";
import { sendRetentionEmail } from "@/lib/email";

// Sends every retention email that is due (lib/admin/retention.ts) and records
// each one in retention_notices, so it never goes twice. Run daily by Vercel
// (app/api/cron/retention) and on demand from the admin roster. It never
// clears anything: for now the admin approves each clear.

export type NoticeRun = { ok: true; checked: number; due: number; sent: number; notSent: string[] } | { ok: false; error: string };

export async function sendDueNotices(admin: SupabaseClient, now = new Date()): Promise<NoticeRun> {
  const roster = await loadRoster(admin, now);
  if (!roster.ok) return { ok: false, error: roster.notReady ? "The roster needs migration 0046 run in Supabase first." : roster.error };

  const due = roster.members.filter((m) => m.state.due && m.email);
  let sent = 0;
  const notSent: string[] = [];
  for (const m of due) {
    const notice = m.state.due!;
    try {
      const delivered = await sendRetentionEmail({ to: m.email!, name: m.full_name, kind: notice.kind, clearOn: notice.clearOn });
      if (!delivered) {
        notSent.push(`${m.email}: email is not set up (RESEND_API_KEY and RESEND_FROM_EMAIL)`);
        continue;
      }
    } catch (error) {
      notSent.push(`${m.email}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    const { error } = await admin.from("retention_notices").insert({ user_id: m.user_id, kind: notice.kind, clear_on: notice.clearOn });
    if (error && error.code !== "23505") notSent.push(`${m.email}: sent, but not recorded (${error.message})`);
    else sent += 1;
  }
  return { ok: true, checked: roster.members.length, due: due.length, sent, notSent };
}
