import { NextResponse } from "next/server";
import { authReplies, requireAdmin } from "@/lib/auth";
import { sendDueNotices } from "@/lib/admin/notices";
import { supabaseAdmin } from "@/lib/supabase/admin";

// The admin's "Send due notices now": the same run the daily job makes.
export const maxDuration = 60;

async function handlePOST() {
  await requireAdmin();
  const admin = supabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Notices need SUPABASE_SERVICE_ROLE_KEY on the server." }, { status: 503 });
  const run = await sendDueNotices(admin);
  return NextResponse.json(run, { status: run.ok ? 200 : 503 });
}

export const POST = authReplies(handlePOST);
