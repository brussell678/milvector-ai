import { NextResponse } from "next/server";
import { authReplies, requireAdmin } from "@/lib/auth";
import { clearTransitionRecords } from "@/lib/admin/clear-records";
import { loadRoster } from "@/lib/admin/members";
import { ymd } from "@/lib/admin/retention";
import { sendRetentionEmail } from "@/lib/email";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Clears one member's transition records (lib/admin/clear-records.ts), logs
// it, and emails the member what was cleared and what stays. The admin
// approves each clear for now; the roster says whether the member had both
// notices. Never the admin's own account.

export const maxDuration = 60;

async function handlePOST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const admin = supabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Clearing needs SUPABASE_SERVICE_ROLE_KEY on the server." }, { status: 503 });
  const { id } = await params;

  const roster = await loadRoster(admin, new Date());
  if (!roster.ok) return NextResponse.json({ error: roster.notReady ? "The roster needs migration 0046 run in Supabase first." : roster.error }, { status: 503 });
  const member = roster.members.find((m) => m.user_id === id);
  if (!member) return NextResponse.json({ error: "That member no longer exists." }, { status: 404 });

  const result = await clearTransitionRecords(admin, id);
  if (!result.ok) {
    console.error("[members] clear failed:", result.stage, result.error);
    return NextResponse.json({ error: `Clearing stopped at the ${result.stage} step: ${result.error}. Try again; finished steps are skipped.` }, { status: 500 });
  }

  await admin.from("member_admin_actions").insert({
    user_id: id,
    action: "clear_records",
    detail: {
      status: member.state.status,
      documents: member.documents,
      resumes: member.resumes,
      linkedin: member.linkedin,
      invites: member.invites,
      timeline_done: member.timeline_done,
      tool_runs: member.tool_runs,
      files: result.files,
    },
  });

  let emailed = false;
  if (member.email) {
    const today = ymd(new Date());
    try {
      emailed = await sendRetentionEmail({ to: member.email, name: member.full_name, kind: "cleared", clearOn: today });
      if (emailed) await admin.from("retention_notices").insert({ user_id: id, kind: "cleared", clear_on: today });
    } catch (error) {
      console.error("[members] cleared email failed:", error);
    }
  }
  return NextResponse.json({ ok: true, files: result.files, emailed });
}

export const POST = authReplies(handlePOST);
