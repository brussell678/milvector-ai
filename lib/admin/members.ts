import type { SupabaseClient } from "@supabase/supabase-js";
import { isAdminEmail } from "@/lib/auth";
import { retentionState, type RetentionState, type SentNotice } from "@/lib/admin/retention";

// The admin's member roster (migration 0046): one row per member from
// admin_member_roster(), with where each one stands on the retention
// timeline (lib/admin/retention.ts). Service role only.

export type RosterRow = {
  user_id: string;
  email: string | null;
  joined_at: string;
  last_sign_in_at: string | null;
  full_name: string | null;
  branch: string | null;
  rank: string | null;
  retirement_date: string | null;
  last_seen_at: string | null;
  records_cleared_at: string | null;
  documents: number;
  file_bytes: number;
  resumes: number;
  linkedin: number;
  invites: number;
  timeline_done: number;
  tool_runs: number;
  last_tool_run: string | null;
  cards: number;
  live_cards: number;
  data_bytes: number;
};

export type RosterMember = RosterRow & { hasRecords: boolean; state: RetentionState };

/** Whether clearing would remove anything: uploads, resumes, LinkedIn drafts, an invitation, Timeline progress, or tool history. */
export function hasRecords(r: Pick<RosterRow, "documents" | "resumes" | "linkedin" | "invites" | "timeline_done" | "tool_runs">): boolean {
  return r.documents + r.resumes + r.linkedin + r.invites + r.timeline_done + r.tool_runs > 0;
}

export type RosterResult = { ok: true; members: RosterMember[] } | { ok: false; notReady: boolean; error: string };

/** Every member but the admin, longest since last use first. */
export async function loadRoster(admin: SupabaseClient, now: Date): Promise<RosterResult> {
  const { data, error } = await admin.rpc("admin_member_roster");
  if (error) {
    const notReady = error.code === "PGRST202" || error.code === "42883" || /admin_member_roster/.test(error.message);
    return { ok: false, notReady, error: error.message };
  }
  const notices = await admin.from("retention_notices").select("user_id,kind,clear_on,sent_at");
  const byMember = new Map<string, SentNotice[]>();
  for (const n of (notices.data ?? []) as Array<SentNotice & { user_id: string }>) {
    byMember.set(n.user_id, [...(byMember.get(n.user_id) ?? []), { kind: n.kind, clear_on: n.clear_on, sent_at: n.sent_at }]);
  }

  const members = ((data ?? []) as RosterRow[])
    .filter((row) => !isAdminEmail(row.email))
    .map((raw) => {
      // Counts and sizes can arrive as strings (bigint); make them numbers.
      const row = {
        ...raw,
        documents: Number(raw.documents),
        file_bytes: Number(raw.file_bytes),
        resumes: Number(raw.resumes),
        linkedin: Number(raw.linkedin),
        invites: Number(raw.invites),
        timeline_done: Number(raw.timeline_done),
        tool_runs: Number(raw.tool_runs),
        cards: Number(raw.cards),
        live_cards: Number(raw.live_cards),
        data_bytes: Number(raw.data_bytes),
      };
      const records = hasRecords(row);
      const state = retentionState(
        {
          joinedAt: row.joined_at,
          lastSignInAt: row.last_sign_in_at,
          lastSeenAt: row.last_seen_at,
          lastToolRun: row.last_tool_run,
          retirementDate: row.retirement_date,
          recordsClearedAt: row.records_cleared_at,
          hasRecords: records,
        },
        byMember.get(row.user_id) ?? [],
        now,
      );
      return { ...row, hasRecords: records, state };
    })
    .sort((a, b) => a.state.lastActive.getTime() - b.state.lastActive.getTime());

  return { ok: true, members };
}
