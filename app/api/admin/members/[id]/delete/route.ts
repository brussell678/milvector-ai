import { NextResponse } from "next/server";
import { z } from "zod";
import { CONFIRM_WORD, deleteAccount } from "@/lib/account/delete";
import { authReplies, requireAdmin } from "@/lib/auth";
import { loadRoster } from "@/lib/admin/members";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Deletes a member's whole account, the same way members can from their
// Profile (lib/account/delete.ts), after the admin types the confirm word.
// Logged by member id with counts, no name or email. Never the admin's own.

export const maxDuration = 60;

const ConfirmSchema = z.object({ confirm: z.literal(CONFIRM_WORD) });

async function handlePOST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const parsed = ConfirmSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: `Type ${CONFIRM_WORD} to confirm.` }, { status: 400 });
  const admin = supabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Deleting needs SUPABASE_SERVICE_ROLE_KEY on the server." }, { status: 503 });
  const { id } = await params;

  const roster = await loadRoster(admin, new Date());
  if (!roster.ok) return NextResponse.json({ error: roster.notReady ? "The roster needs migration 0046 run in Supabase first." : roster.error }, { status: 503 });
  const member = roster.members.find((m) => m.user_id === id);
  if (!member) return NextResponse.json({ error: "That member no longer exists." }, { status: 404 });

  const result = await deleteAccount(admin, id);
  if (!result.ok) {
    console.error("[members] delete failed:", result.stage, result.error);
    return NextResponse.json({ error: `Deleting stopped at the ${result.stage} step: ${result.error}. Try again; finished steps are skipped.` }, { status: 500 });
  }

  await admin.from("member_admin_actions").insert({
    user_id: id,
    action: "delete_account",
    detail: { status: member.state.status, cards: member.cards, documents: member.documents, resumes: member.resumes, files: result.files },
  });
  return NextResponse.json({ ok: true, files: result.files });
}

export const POST = authReplies(handlePOST);
